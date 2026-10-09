# Requirement status

Against the requirements doc. **Built** means the code exists and is covered by automated tests or was run in a browser here. **Needs hardware check** means it is written but could only be verified against stubs, because the development environment had no Pi, TV, Google or Dynatrace account.

| ID | Requirement | Status |
| --- | --- | --- |
| DEV-1 | One setup path for a new Pi | Built: `deploy/pi/install.sh`. **Needs hardware check.** |
| DEV-2 | Full-screen kiosk on boot | Built: `cage` + Chromium service. **Needs hardware check.** |
| DEV-3 | Recovers from crashes and network loss | Built: systemd restart, waiting page, live-update reconnect. **Needs hardware check.** |
| DEV-4 | Device manager: URL, rotation, Wi-Fi, hostname, time zone | Built (agent tested). Resolution setting not included. |
| DEV-5 | Cron jobs managed for you | Built and tested (`/etc/cron.d/home-display`). |
| DEV-6 | TV on/off schedule over CEC, manual buttons | Built; schedule rendering and commands tested with a fake CEC. **Needs hardware check.** |
| DEV-7 | Device health | Built (CPU, memory, disk, temperature, kiosk, TV, containers). |
| DEV-8 | Pair by code | Later. Replaced for now by automatic local pairing. |
| ADM-1 | Sign-in, households and users in the data model | Built (one admin per household; no invites yet). |
| ADM-2 | Layout editor | Built. |
| ADM-3 | Live preview | Built (real data, at 1080p). |
| ADM-4 | Publish reaches the TV within seconds | Built (server-sent events), tested in a browser. |
| ADM-5 | Display URL with secret, regenerate | Built. |
| ADM-6 | Theme: colours, photo, font, clock format, units | Built. |
| ADM-7 | Connected accounts | Built (Google). **Needs real Google check.** |
| ADM-8 | Multiple layouts per display, scheduled | Later. Multiple displays are supported. |
| MOD-1, 2, 3 | Module manifest, server-side data, common options | Built. Settings forms come from the manifest. |
| MOD-4 | Add a module without changing core code | Mostly: one line in each of three registries ([modules.md](modules.md)). |
| CAL-1 to 3 | Calendar: agenda/day/week/month, Google and ICS, colours | Built; ICS with repeating events tested. Google **needs real Google check.** |
| WX-1 | Weather with 1 to 14 forecast days, units, location | Built; tested against a stand-in for Open-Meteo. **Needs a check on the real service.** |
| LST-1 | To-do, shopping, weekly meals | Built. |
| LST-2 | Custom lists with chosen fields | Partly: custom lists have text, done and notes, and a display style. No user-defined fields. |
| LST-3 | Edit lists from app, (later) mobile and AI | Built for the app and API. |
| GS-1, GS-2 | Create a Google Sheet for a list, share it, sync back | Built; Sheet mapping tested, API calls **need real Google check.** |
| AI-1 | Everything available through an API with tokens | Built ([api.md](api.md)). |
| AI-2 | MCP server for Claude | Not built. The API is ready for it. |
| TEC-1 | Containerised | Built (`Dockerfile`, `docker-compose.yml`). The image could not be pulled from Docker Hub in the build environment (rate limit); the same steps were run by hand. **Run `docker compose up --build` once.** |
| TEC-2 | Kiosk and CEC on the host | Built. |
| TEC-3 | Configuration as code | Built for the Pi (compose, scripts, units). Cloud IaC deferred. |
| TEC-4 | Dynatrace | Script written from Dynatrace's documented installer API. **Needs a check against your tenant.** |
| TEC-6 | Multi-tenant ready | Built into the schema and queries. |
| TEC-7, 8 | One API; unguessable display link; login | Built. |
| TEC-9 | Works offline with last data | Built: stale data served by the app, page keeps running. |
| TEC-10 | Update with rollback | Update is re-running the installer. Rollback is not automated. |
