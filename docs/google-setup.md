# Connecting Google (Calendar and Sheets)

Calendar links (ICS) work with no setup. Google Calendar and the Google Sheets for lists need a Google Cloud OAuth app that you own. This takes about ten minutes, once.

1. Go to <https://console.cloud.google.com/>, create a project (for example "Home Display").
2. **APIs & Services → Library**: enable **Google Calendar API**, **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your email. Under **Audience**, add every Google account you will connect as a **Test user**. (Leaving the app in "Testing" is fine for home use. Google expires refresh tokens after 7 days for apps in Testing; publish the app to "In production" to avoid reconnecting weekly. For a personal app with only you as a user, no verification is needed for the scopes below, but Google shows an "unverified app" warning you can click through.)
4. **Credentials → Create credentials → OAuth client ID → Application type: Desktop app.** Copy the client ID and secret.
5. Put them in `/opt/home-display/.env` on the Pi:

   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

   then `cd /opt/home-display && sudo docker compose up -d`.
6. In the admin app: **Settings → Connect a Google account**. After you approve, Google sends your browser to an address starting with `http://127.0.0.1:53682` that will not load. That is expected: copy the full address from the browser's address bar and paste it into the box, then press **Finish**.

Scopes requested: read-only Calendar, and `drive.file`, which lets the app open **only the Sheets it created**, not the rest of your Drive.

## If you serve the admin app over HTTPS on the internet

Use an OAuth client of type **Web application**, add `https://your-host/api/google/callback` as an authorised redirect URI, and set `GOOGLE_REDIRECT_URI` to the same address. Then the connect button completes without pasting. This is also the setup the hosted version will use.
