# Home Display

A self-hosted, DAKboard-style display for a TV. You design the screen in a web dashboard, the dashboard gives you a link, and a Raspberry Pi on the TV shows that link full screen.

Version 1 runs entirely on the Pi. The code is split so the same pieces can later run as a hosted service where many households sign up.

```
 phone / laptop ──► Admin app (Designer, Lists, Device, Settings) ─┐
                                                                   ├─► API + modules ──► Google, weather
 TV ◄── HDMI ── Pi: Chromium kiosk ──► Display page (/d/<secret>) ─┘         │
                 Device agent: HDMI-CEC, schedules, Wi-Fi         SQLite (lists, layouts, tokens)
                 Dynatrace OneAgent: host + containers
```

## What you get

- **Designer** with a live 1080p preview: drag, resize and configure widgets, then publish. The TV updates within a second.
- **Modules**: Clock, Calendar (Google and any ICS link; agenda, day, week, month), Weather (Open-Meteo, 1 to 14 days), Lists (to-do, shopping, weekly meals, custom).
- **Google Sheets for lists**: one click creates a Sheet (for meals: Monday to Sunday with blanks), shares it with your family, and edits there show on the TV.
- **Device manager**: TV on/off schedule over HDMI-CEC, screen rotation, Wi-Fi, time zone, health, restart browser or reboot.
- **Easy Pi setup**: one script. A new Pi shows a "finish setup on your phone" screen and then switches to your display by itself.
- **API tokens** for the future mobile app and AI tools. Every action in the admin app is available through the API.
- **Dynatrace** monitoring script for the Pi and its containers.

## Set up a Pi

1. Flash **Raspberry Pi OS Lite (64-bit)** with Raspberry Pi Imager. In its settings add your Wi-Fi, enable SSH and set a hostname such as `homedisplay`.
2. SSH in, then:

   ```sh
   git clone https://github.com/aurua-digital/internal-home-display.git
   cd internal-home-display
   sudo ./deploy/pi/install.sh
   ```
3. Open `http://homedisplay.local:8080` on your phone, create your account and design your screen.

More detail: [docs/pi-setup.md](docs/pi-setup.md). Google: [docs/google-setup.md](docs/google-setup.md). Monitoring: [docs/monitoring.md](docs/monitoring.md).

## Develop on your computer

Needs Node 22.13 or newer.

```sh
npm install
npm run dev -w @hd/api      # API on :8080 (data in ./data)
npm run dev -w @hd/web      # web app on :5173, proxies /api to :8080
npm test                    # API + module tests
python3 -m unittest discover -s device/agent    # device agent tests
```

Run the whole thing in Docker the way the Pi does: `cp .env.example .env && docker compose up --build`.

## Layout

| Path | What it is |
| --- | --- |
| `apps/api` | Fastify API: accounts, displays, lists, Google, device proxy, live updates |
| `apps/web` | React app: Designer, Lists, Device, Settings, and the display page the TV loads |
| `packages/modules` | The modules. One folder each: manifest, data loader, drawing |
| `device/` | What runs on the Pi itself: agent, kiosk scripts, systemd units |
| `deploy/pi/` | Pi installer and Dynatrace installer |
| `docs/` | Guides, architecture, [requirement status](docs/status.md) |

Adding a module (a new widget): [docs/modules.md](docs/modules.md).
