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

const signOutFromStremio = async (page) => {
  try {
    console.log(`[${formatTimestamp()}] Attempting to sign out from Stremio`);
    const signOutSelector = 'a.sign-out-button';
    const clicked = await tryClick(page, signOutSelector);
    if (clicked) {
      await page.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
      console.log(`[${formatTimestamp()}] Stremio sign-out successful`);
    } else {
      console.log(`[${formatTimestamp()}] Stremio sign-out failed: Sign-out button not found`);
    }
  } catch (err) {
    console.error(`[${formatTimestamp()}] Stremio sign-out failed:`, err.message);
  }
};

(async () => {
  console.log(`--- Script started at: ${formatTimestamp()} ---`);
  let browser = null;

  try {
    // Validate environment variables
    const { stremioEmail, stremioPassword, traktEmail, traktPassword } = process.env;
    if (!stremioEmail || !stremioPassword || !traktEmail || !traktPassword) {
      console.error(`[${formatTimestamp()}] Missing required environment variables`);
      process.exit(1);
    }

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

    await page.goto('https://www.stremio.com/login', { waitUntil: 'load' });
    console.log(`[${formatTimestamp()}] Stremio login page loaded`);

    await page.evaluate((email, password) => {
      document.querySelector('#email').value = email;
      document.querySelector('#password').value = password;
    }, stremioEmail, stremioPassword);

    await page.click('input[type="submit"]');

    try {
      await page.waitForSelector("#my-account", { visible: true, timeout: 10000 });
      console.log(`[${formatTimestamp()}] Stremio login successful`);
    } catch {
      console.log(`[${formatTimestamp()}] Stremio login failed – maybe credentials rejected or session dropped`);
      return;
    }

    console.log(`[${formatTimestamp()}] Skipping Trakt status check – forcing reauthentication`);
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
      console.log(`[${formatTimestamp()}] Trakt login page detected`);
      try {
        await newPage.evaluate((email, password) => {
          document.querySelector('#user_login').value = email;
          document.querySelector('#user_password').value = password;
          document.querySelector('input[name="commit"]').click();
        }, traktEmail, traktPassword);
      } catch (err) {
        console.log(`[${formatTimestamp()}] Trakt login failed:`, err.message);
      }
    }

    const yesClicked = await tryClick(newPage, 'input[name="commit"]');
    if (yesClicked) {
      try {
        await newPage.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
      } catch {}

      const currentUrl = newPage.url();
      console.log(`[${formatTimestamp()}] Final redirect URL:`, currentUrl);

      if (currentUrl.includes('login-trakt-complete')) {
        console.log(`[${formatTimestamp()}] Trakt authorization successful`);
      } else {
        console.log(`[${formatTimestamp()}] Trakt authorization may have partially failed`);
      }

      await page.bringToFront();
      await page.reload({ waitUntil: 'load' });
      console.log(`[${formatTimestamp()}] Stremio page reloaded after Trakt authorization`);

      // Sign out from Stremio regardless of Trakt authorization outcome
      await signOutFromStremio(page);

      await newPage.close();
    } else {
      console.log(`[${formatTimestamp()}] Trakt authorization skipped: "Yes" button was not clicked`);
      // Sign out from Stremio even if Trakt authorization was skipped
      await page.bringToFront();
      await page.reload({ waitUntil: 'load' });
      console.log(`[${formatTimestamp()}] Stremio page reloaded`);
      await signOutFromStremio(page);
    }

  } catch (err) {
    console.error(`[${formatTimestamp()}] A critical error occurred:`, err.message, err.stack);
  } finally {
    if (browser) {
      const pages = await browser.pages();
      await Promise.all(pages.map(page => page.close()));
      await browser.close();
    }
    console.log(`--- Script ended at: ${formatTimestamp()} ---`);
  }

  process.exit(0);
})();
