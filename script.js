const puppeteer = require('puppeteer');

const formatTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
};

const setupPageInterception = async (page) => {
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const blocked = ['image', 'stylesheet', 'font', 'media'];
    blocked.includes(request.resourceType()) ? request.abort() : request.continue();
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
      await page.evaluate(sel => document.querySelector(sel)?.click(), selector);
      return true;
    } catch {
      return false;
    }
  }
};

(async () => {
  console.log(`--- Script started at: ${formatTimestamp()} ---`);
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: '/usr/bin/chromium',
      defaultViewport: { width: 1366, height: 768 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-features=VizDisplayCompositor',
        '--disable-gl-drawing-for-tests',
        '--disable-accelerated-2d-canvas',
        '--hide-scrollbars',
        '--mute-audio'
      ]
    });

    const page = await browser.newPage();
    await setupPageInterception(page);

    const { stremioEmail, stremioPassword, traktEmail, traktPassword } = process.env;

    await page.goto('https://www.stremio.com/login', { waitUntil: 'load' });
    console.log("Stremio login page loaded");

    await page.evaluate((email, password) => {
      document.querySelector('#email').value = email;
      document.querySelector('#password').value = password;
    }, stremioEmail, stremioPassword);

    await page.click('input[type="submit"]');

    try {
      await page.waitForSelector("#my-account", { visible: true, timeout: 10000 });
      console.log("Stremio login successful");
    } catch {
      console.log("Stremio login failed – maybe credentials rejected or session dropped");
      return;
    }

    console.log("Skipping Trakt status check – forcing reauthentication");
    await tryClick(page, '.integrations-button.trakt-connect-button');
    await new Promise(res => setTimeout(res, 1000));

    const newPage = await browser.newPage();
    await setupPageInterception(newPage);

    await newPage.goto(
      'https://api.trakt.tv/oauth/authorize?client_id=0e861f52c7365efe6da5ea3e2e6641b8d25d87aca3133e8d4f7dc8487368d14b' +
      '&redirect_uri=https%3A%2F%2Fwww.strem.io%2Ftrakt%2Fauth_cb&response_type=code',
      { waitUntil: 'load' }
    );

    if (newPage.url().includes("auth/signin")) {
      console.log("Trakt login page detected");
      try {
        await newPage.evaluate((email, password) => {
        document.querySelector('#user_login').value = email;
        document.querySelector('#user_password').value = password;
        document.querySelector('input[name="commit"]').click();
        }, traktEmail, traktPassword);
      } catch (err) {
        console.log("Trakt login failed:", err.message);
      }
    }

    const yesClicked = await tryClick(newPage, 'input[name="commit"]');
    if (yesClicked) {
      try {
        await newPage.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
      } catch {}

      const currentUrl = newPage.url();
      console.log("Final redirect URL:", currentUrl);

      if (currentUrl === 'https://www.stremio.com/?login-trakt-complete') {
        console.log('Trakt authorization successful');
        await page.bringToFront();
        await page.reload({ waitUntil: 'load' });
        console.log('Stremio page reloaded after Trakt authorization');
      } else {
        console.log('Trakt authorization may have partially failed');
      }

      await newPage.close();
    } else {
      console.log('Trakt authorization skipped: "Yes" button was not clicked');
    }

  } catch (err) {
    console.error("A critical error occurred:", err);
  } finally {
    if (browser) await browser.close();
    console.log(`--- Script ended at: ${formatTimestamp()} ---`);
  }

  process.exit(0);
})();
