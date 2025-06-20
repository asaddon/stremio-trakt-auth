const formatTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
};

const headless = true;
const puppeteer = require('puppeteer');

const setupPageInterception = async (page) => {
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
      request.abort();
    } else {
      request.continue();
    }
  });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setDefaultNavigationTimeout(30000);
};

const tryClick = async (page, selector) => {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
    await page.click(selector);
    return true;
  } catch {
    try {
      await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) element.click();
      }, selector);
      return true;
    } catch {
      return false;
    }
  }
};

let browser = null;

(async () => {
  console.log(`--- Script started at: ${formatTimestamp()} ---`);
  try {
    browser = await puppeteer.launch({
      headless: headless,
      executablePath: '/usr/bin/chromium',
      defaultViewport: { width: 1366, height: 768 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--no-first-run',
        '--disable-default-apps'
      ]
    });

    const page = await browser.newPage();
    await setupPageInterception(page);

    const stremioEmail = process.env.stremioEmail;
    const stremioPassword = process.env.stremioPassword;

    await page.goto('https://www.stremio.com/login', { waitUntil: 'load', timeout: 30000 });
    console.log("Stremio login page loaded");

    await page.evaluate((email, password) => {
      document.querySelector('#email').value = email;
      document.querySelector('#password').value = password;
    }, stremioEmail, stremioPassword);

    await page.click('input[type="submit"]');

    try {
      await page.waitForSelector("#my-account", { visible: true, timeout: 10000 });
      console.log("Stremio login successful");
    } catch (err) {
      console.log("Stremio login failed – maybe credentials rejected or session dropped");
      await browser.close();
      console.log(`--- Script ended at: ${formatTimestamp()} ---`);
      process.exit(1);
    }

    console.log("Skipping Trakt status check – forcing reauthentication");
    await tryClick(page, '.integrations-button.trakt-connect-button');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newPage = await browser.newPage();
    await setupPageInterception(newPage);

    const traktAuthUrl = 'https://api.trakt.tv/oauth/authorize'
      + '?client_id=0e861f52c7365efe6da5ea3e2e6641b8d25d87aca3133e8d4f7dc8487368d14b'
      + '&redirect_uri=https%3A%2F%2Fwww.strem.io%2Ftrakt%2Fauth_cb'
      + '&response_type=code';

    await newPage.goto(traktAuthUrl, { waitUntil: 'load', timeout: 30000 });

    if (newPage.url().includes("auth/signin")) {
      console.log("Trakt login page detected");

      const traktEmail = process.env.traktEmail;
      const traktPassword = process.env.traktPassword;

      try {
        await newPage.waitForSelector('form', { timeout: 30000 });
        await newPage.keyboard.type(traktEmail, { delay: 100 });
        await newPage.keyboard.press('Tab');
        await newPage.keyboard.type(traktPassword, { delay: 100 });
        await newPage.keyboard.press('Enter');
        console.log("Trakt credentials submitted with keyboard navigation");
        await newPage.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
        console.log("Trakt login submitted, waiting for redirect...");
      } catch (err) {
        console.log("Trakt login failed:", err.message);
      }
    }

    await newPage.waitForSelector('input[name="commit"]', { timeout: 15000 });
    const yesClicked = await tryClick(newPage, 'input[name="commit"]');

    if (yesClicked) {
      try {
        await newPage.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
      } catch {
        console.log("Navigation after Trakt authorization may have timed out");
      }

      const currentUrl = newPage.url();
      console.log("Final redirect URL:", currentUrl);

      if (currentUrl === 'https://www.stremio.com/?login-trakt-complete') {
        console.log('Trakt authorization successful');
        await page.bringToFront();
        await page.reload({ waitUntil: 'load', timeout: 30000 });
        console.log('Stremio page reloaded after Trakt authorization');
      } else {
        console.log('Trakt authorization may have partially failed');
      }

      await newPage.close();
    } else {
      console.log('Trakt authorization skipped: "Yes" button was not clicked');
      await newPage.close();
    }

  } catch (err) {
    console.error("A critical error occurred:", err);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log(`--- Script ended at: ${formatTimestamp()} ---`);
  }

  process.exit(0);
})();
