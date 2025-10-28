# Stremio Trakt Auto Auth

Automatic re-authorization between Stremio and Trakt in a headless environment using Puppeteer.  
This script uses your Trakt credentials and Stremio Trakt UUID to re-establish the Trakt.tv connection if the authentication expires or disconnects.

---

## ❗ Root Cause

Stremio does not refresh the Trakt authentication token, which causes it to expire after ~24 hours.  
Some users have reported that the token can expire in just a few minutes.  
An alert may appear in your Stremio web account settings when this happens:

![image](https://github.com/user-attachments/assets/dd994c82-b4ce-4c75-a924-5f4599b7e225)

Bug tracking:  
https://github.com/Stremio/stremio-bugs/issues/1427

---

## 🧪 Tested Environment

- Tested successfully on `arm64` systems and within `CasaOS`.
- An `amd64` image was also shared, but is currently **untested**.

---

## 🛠️ Installation – CasaOS (Docker Compose)

1. In CasaOS, click the **`+`** icon in the top-right corner → select **Custom Install**.
2. In the new window, click **Import** (top-right corner).
3. Paste the contents of the `compose.yaml` file from this repository.
4. Make sure to set the **environment variables** correctly.

---

## 🐳 Installation – Docker CLI

```bash
docker run -d \
  --name stremio-trakt-auth \
  --network bridge \
  --restart unless-stopped \
  -e SLEEP_SECONDS=600 \
  -e stremioTraktUUID=your_stremio_trakt_uuid \
  -e traktEmail=your_trakt_email \
  -e traktPassword=your_trakt_password \
  markflaisz/stremio-trakt-auth:latest
```

---

## 🔐 Environment Variables

| Variable            | Description                              |
|---------------------|------------------------------------------|
| `stremioTraktUUID`  | Your Stremio Trakt UUID string (found in Stremio Addons Page) |
| `traktEmail`        | Your Trakt.tv account email address      |
| `traktPassword`     | Your Trakt.tv account password           |
| `SLEEP_SECONDS`     | Interval between each re-auth attempt (default: 600 seconds = 10 minutes) |

### How to find your Stremio Trakt UUID

1. Login to Stremio (preferably on [Stremio Web](https://app.strem.io))
2. Go to the **Addons** page
3. Look for the **"Trakt Integration"** addon
4. Click on the **"Share Addon"** button
5. Copy the complete addon URL (it will look like: `https://www.strem.io/trakt/addon/0123456789abcdef01234567/manifest.json`)
6. Extract the string between `/addon/` and `/manifest.json` (in the example above: `0123456789abcdef01234567`)
7. Use this UUID string as the `stremioTraktUUID` environment variable

---

## 🧾 License & Credits

This project was inspired by the work of [unleashed7](https://github.com/unleashed7).  
Without their original solution, this project would not exist.
