# Architecture

## Pieces

| Piece | Runs | Job |
| --- | --- | --- |
| **App container** (`apps/api` + `apps/web`) | Docker on the Pi | One Node process serves the API, the admin app and the display page. SQLite for data. |
| **Modules** (`packages/modules`) | Inside the app | Manifest + data loader (server) + drawing (browser) per widget. |
| **Device agent** (`device/agent`) | Pi host, systemd | Kiosk restart, HDMI-CEC, cron schedule, Wi-Fi, time zone, reboot, health. Python, standard library only. |
| **Kiosk** (`device/kiosk`, `device/systemd`) | Pi host, systemd | `cage` + Chromium full screen, auto-restart, waits for the network. |
| **Dynatrace OneAgent** | Pi host | Monitors host and containers. |

The kiosk, CEC and Wi-Fi are on the host, not in Docker, because they need the real screen, HDMI port and network manager. The app reaches the agent on `127.0.0.1:8765` with a shared secret.

## How a change reaches the TV

1. In the Designer you move a widget. The preview draws the real widget with real data (`POST /api/preview/data`), so nothing is faked.
2. **Publish** saves the layout (`PUT /api/displays/:id`) and sends a `layout` event to every TV connected to that display over server-sent events.
3. The display page reloads the layout and redraws. Lists send a `data` event when edited, so a tick on the shopping list shows within a second.

The display page never calls Google or the weather service. It asks the app for each widget's data (`GET /api/d/:token/widgets/:id`), which the app loads through the module and caches. If the network drops, the app serves the last good data marked stale and the TV keeps showing it.

## Data

SQLite file in the `/data` volume. Tables: `households`, `users`, `api_tokens`, `displays` (layout and theme as JSON), `lists`, `list_items`, `accounts` (Google tokens, AES-GCM encrypted with `APP_SECRET`). A list linked to a Google Sheet keeps its items in the Sheet and reads them with a 30 second cache; unlinking copies them back.

## Built to become a hosted service

| Seam | Today | For the hosted version |
| --- | --- | --- |
| Tenancy | Every table has `household_id`; every query is scoped to the signed-in household | Add sign-up, email verification and password reset; nothing else in the data model changes |
| Database | `node:sqlite` in `db.ts` | Swap for Postgres behind the same functions |
| Pi pairing | Pi opens the first local display | Pi shows a code, user enters it, server returns the display link (`DEV-8`). The kiosk already supports an explicit remote address. |
| Google | Your own OAuth app, copy-paste connect | Same code with `GOOGLE_REDIRECT_URI` set; one OAuth app for all users (needs Google verification) |
| API | One API used by the web app; bearer tokens exist | Same API for the mobile app and an MCP server |
| Device control | App calls the agent on localhost | The agent would poll or hold a connection to the cloud instead; commands stay the same |
| Infra as code | Compose file and Pi scripts are the whole deployment | Add Terraform/Helm for the cloud app when it exists. Nothing to provision for the Pi version. |

## Security notes

- Display links carry a random 192-bit token; regenerate to revoke. Anyone with the link sees that screen (and only that).
- Admin routes need a session cookie or API token. Passwords use scrypt. Google tokens are encrypted at rest.
- `/api/pair/local` only answers connections that come directly from the Pi itself and refuses anything carrying proxy headers.
- The admin app is plain HTTP on your home network by default. Do not expose port 8080 to the internet without HTTPS in front (and set `SECURE_COOKIES=true`).
- The device agent listens on localhost only and requires its token.
