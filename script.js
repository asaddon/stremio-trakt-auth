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

    // Wait for both Trakt and Stremio redirects to settle
  let finalUrl;
  for (let i = 0; i < 5; i++) {
  await new Promise(res => setTimeout(res, 2000)); // 2s intervals
  finalUrl = page.url();
  if (finalUrl.includes('login-trakt-complete')) break;
  if (finalUrl.includes('auth_cb?code=')) {
    // give Stremio a few seconds to exchange code -> token -> complete redirect
    await new Promise(res => setTimeout(res, 5000));
  }
  }

  console.log(`[${formatTimestamp()}] Final redirect URL: ${finalUrl}`);
  if (finalUrl.includes('login-trakt-complete')) {
  console.log(`[${formatTimestamp()}] ✅ Trakt authorization complete`);
  } else if (finalUrl.includes('auth_cb?code=')) {
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
