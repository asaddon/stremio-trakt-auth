require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

const formatTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
};

const takeScreenshot = async (page, label) => {
  if (process.env.DEBUG_SCREENSHOTS === "true") {
    const filename = `debug-${label}-${Date.now()}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`[${formatTimestamp()}] Saved screenshot: ${filename}`);
  }
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
    await page.waitForSelector(selector, { visible: true, timeout: 4000 });
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
      await page.waitForNavigation({ waitUntil: 'load', timeout: 10000 }).catch(() => {});
      console.log(`[${formatTimestamp()}] Stremio sign-out successful`);
    } else {
      console.log(`[${formatTimestamp()}] Stremio sign-out failed: button not found`);
    }
  } catch (err) {
    console.error(`[${formatTimestamp()}] Sign-out error:`, err.message);
  }
};

(async () => {
  console.log(`--- Script started at: ${formatTimestamp()} ---`);
  let browser = null;

  try {
    const { stremioEmail, stremioPassword, traktEmail, traktPassword } = process.env;
    if (!stremioEmail || !stremioPassword || !traktEmail || !traktPassword) {
      console.error(`[${formatTimestamp()}] Missing environment variables`);
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

    // --- Login to Stremio ---
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
      console.log(`[${formatTimestamp()}] Stremio login failed`);
      return;
    }

    console.log(`[${formatTimestamp()}] Forcing Trakt reauthentication`);
    await tryClick(page, '.integrations-button.trakt-connect-button');
    await new Promise(res => setTimeout(res, 1000));

    // --- Open Trakt Auth Page ---
    const newPage = await browser.newPage();
    await setupPageInterception(newPage);

    const traktAuthURL =
      'https://api.trakt.tv/oauth/authorize?client_id=0e861f52c7365efe6da5ea3e2e6641b8d25d87aca3133e8d4f7dc8487368d14b' +
      '&redirect_uri=https%3A%2F%2Fwww.strem.io%2Ftrakt%2Fauth_cb&response_type=code';

    await newPage.goto(traktAuthURL, { waitUntil: 'domcontentloaded' });

    // --- Detect if login needed ---
    if (newPage.url().includes("auth/signin")) {
      console.log(`[${formatTimestamp()}] Trakt login page detected`);
      await takeScreenshot(newPage, 'trakt-login-before');

      try {
        await newPage.evaluate((email, password) => {
          const emailField = document.querySelector('#user_login');
          const passField = document.querySelector('#user_password');
          const form = document.querySelector('form#new_user button.btn[type="submit"]');
          if (emailField && passField) {
            emailField.value = email;
            passField.value = password;
            form?.click();
          }
        }, traktEmail, traktPassword);

        console.log(`[${formatTimestamp()}] Clicked Trakt submit button`);
      } catch (err) {
        console.log(`[${formatTimestamp()}] Trakt login failed:`, err.message);
      }

      // Quick race wait (8s max)
      await Promise.race([
        newPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
        new Promise(res => setTimeout(res, 8000))
      ]);

     // console.log(`[${formatTimestamp()}] Trakt post-login URL: ${newPage.url()}`);
      await takeScreenshot(newPage, 'trakt-login-after');
    } else {
      console.log(`[${formatTimestamp()}] Trakt login page skipped — session already active`);
    }

    // --- Handle "Allow Access" button or existing authorization ---
    const yesClicked = await tryClick(
      newPage,
      'button[name="commit"], input[name="commit"], button.btn-allow, button:has-text("Yes"), button:has-text("Allow")'
    );

    if (yesClicked) {
      console.log(`[${formatTimestamp()}] Clicked Trakt consent button`);
      await Promise.race([
        newPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
        new Promise(res => setTimeout(res, 5000))
      ]);
    } else {
      console.log(`[${formatTimestamp()}] No consent screen — likely already authorized`);
    }

    const currentUrl = newPage.url();
    console.log(`[${formatTimestamp()}] Final redirect URL: ${currentUrl}`);

    if (currentUrl.includes('login-trakt-complete') || currentUrl.includes('auth_cb')) {
      console.log(`[${formatTimestamp()}] ✅ Trakt authorization successful / token refreshed`);
    } else {
      console.log(`[${formatTimestamp()}] ⚠️ Trakt authorization may have partially failed`);
    }

    await page.bringToFront();
    await page.reload({ waitUntil: 'load' });
    console.log(`[${formatTimestamp()}] Stremio page reloaded after Trakt authorization`);

    await signOutFromStremio(page);
    await newPage.close();

  } catch (err) {
    console.error(`[${formatTimestamp()}] Critical error:`, err.message, err.stack);
  } finally {
    if (browser) {
      const pages = await browser.pages();
      await Promise.all(pages.map(p => p.close().catch(() => {})));
      await browser.close();
    }
    console.log(`--- Script ended at: ${formatTimestamp()} ---`);
  }

  process.exit(0);
})();