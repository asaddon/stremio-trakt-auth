require('dotenv').config();
const puppeteer = require('puppeteer');

const formatTimestamp = () => new Date().toISOString().replace("T", " ").substring(0, 19);

(async () => {
  console.log(`--- Script started at: ${formatTimestamp()} ---`);
  let browser;

  try {
    const { traktEmail, traktPassword, stremioTraktUUID } = process.env;
    if (!traktEmail || !traktPassword || !stremioTraktUUID) {
      console.error(`[${formatTimestamp()}] Missing environment variables`);
      console.error(`Required: traktEmail, traktPassword, stremioTraktUUID`);
      process.exit(1);
    }

    const authURL = `https://www.strem.io/trakt/auth/${stremioTraktUUID}`;
    console.log(`[${formatTimestamp()}] Opening Trakt Auth URL: ${authURL}`);

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
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', req => {
      const blocked = ['image', 'stylesheet', 'font', 'media'];
      blocked.includes(req.resourceType()) ? req.abort() : req.continue();
    });

    // --- Load the Stremio Trakt Auth link ---
    await page.goto(authURL, { waitUntil: 'domcontentloaded' });

    // --- Wait for redirect to Trakt login or consent ---
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    console.log(`[${formatTimestamp()}] Current URL: ${page.url()}`);

    // --- Handle Trakt login if needed ---
    if (page.url().includes('trakt.tv/auth/signin')) {
      console.log(`[${formatTimestamp()}] Trakt login page detected`);
      await page.type('#user_login', traktEmail, { delay: 50 });
      await page.type('#user_password', traktPassword, { delay: 50 });
      await page.click('form#new_user button.btn[type="submit"]');
      console.log(`[${formatTimestamp()}] Submitted Trakt login`);

      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    }

    // --- Handle consent screen ---
    const consentSelector = 'button.btn[name="authorize"], input[type="submit"][value="Yes"]';
    const consentButton = await page.$(consentSelector);
    if (consentButton) {
      console.log(`[${formatTimestamp()}] Consent screen detected, approving...`);
      await page.click(consentSelector);
      await page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {});
    } else {
      console.log(`[${formatTimestamp()}] No consent screen found (already authorized?)`);
    }

    // Wait for Stremio's final redirect, be tolerant to slower exchanges
    let finalUrl;
    const loginCompleteRegex = /login-trakt-complete/;
    const authCbRegex = /auth_cb\?code=/;

    // Primary wait: any of the expected URLs using waitForFunction
    await page.waitForFunction(() => {
      const url = window.location.href;
      return /login-trakt-complete/.test(url) || /auth_cb\?code=/.test(url);
    }, { timeout: 30000 }).catch(() => {});

    // If we landed on auth_cb, give Stremio extra time to exchange code -> token
    finalUrl = page.url();
    if (authCbRegex.test(finalUrl)) {
      console.log(`[${formatTimestamp()}] Observed auth_cb, waiting for Stremio exchange...`);
      // Wait for a follow-up navigation to login-trakt-complete
      await page.waitForFunction(() => {
        return /login-trakt-complete/.test(window.location.href);
      }, { timeout: 20000 }).catch(() => {});
    }

    // Final sampling window to catch late client-side redirects
    for (let i = 0; i < 6; i++) {
      finalUrl = page.url();
      if (loginCompleteRegex.test(finalUrl)) break;
      await new Promise(res => setTimeout(res, 2000));
    }

    console.log(`[${formatTimestamp()}] Final redirect URL: ${finalUrl}`);
    if (loginCompleteRegex.test(finalUrl)) {
      console.log(`[${formatTimestamp()}] ✅ Trakt authorization complete`);
    } else if (authCbRegex.test(finalUrl)) {
      console.log(`[${formatTimestamp()}] ⚠️ Authorization stopped at auth_cb, likely finished server-side`);
    } else {
      console.log(`[${formatTimestamp()}] ⚠️ Unknown redirect endpoint`);
    }


  } catch (err) {
    console.error(`[${formatTimestamp()}] ERROR: ${err.message}`);
  } finally {
    if (browser) await browser.close();
    console.log(`--- Script ended at: ${formatTimestamp()} ---`);
  }
})();
