# Stremio Trakt Auto Auth

Automatic re-authorization between Stremio and Trakt in a headless environment using Puppeteer.  
This script logs into your Stremio and Trakt accounts and re-establishes the Trakt.tv connection if the authentication expires or disconnects.

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
  -e stremioEmail=your_stremio_email \
  -e stremioPassword=your_stremio_password \
  -e traktEmail=your_trakt_email \
  -e traktPassword=your_trakt_password \
  markflaisz/stremio-trakt-auth:latest
```

---

## 🔐 Environment Variables

| Variable          | Description                              |
|-------------------|------------------------------------------|
| `stremioEmail`    | Your Stremio account email address       |
| `stremioPassword` | Your Stremio account password            |
| `traktEmail`      | Your Trakt.tv account email address      |
| `traktPassword`   | Your Trakt.tv account password           |
| `SLEEP_SECONDS`   | Interval between each re-auth attempt (default: 600 seconds = 10 minutes) |

---

## 🧾 License & Credits

This project was inspired by the work of [unleashed7](https://github.com/unleashed7).  
Without their original solution, this project would not exist.
