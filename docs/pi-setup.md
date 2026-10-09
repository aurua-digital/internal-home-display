# Setting up a Raspberry Pi

**Hardware:** Raspberry Pi 4 (4 GB) or newer, a TV with HDMI-CEC (most call it Anynet+, Bravia Sync, SimpLink, EasyLink or similar, and it may need turning on in the TV's settings), HDMI cable, power supply, and a good SD card.

**Software:** Raspberry Pi OS **Lite, 64-bit**. Lite matters: the installer replaces the desktop with a single full-screen browser. 64-bit matters: Dynatrace OneAgent does not run on 32-bit.

## Install

```sh
git clone https://github.com/aurua-digital/internal-home-display.git
cd internal-home-display
sudo ./deploy/pi/install.sh
```

The first run builds the app image on the Pi, which takes a few minutes. Running the script again updates everything and keeps your data and `.env`.

What it does: installs Docker, Chromium, the `cage` kiosk compositor and HDMI-CEC tools; starts the app container (`docker compose`); installs the device agent and kiosk as systemd services; sets up a nightly 4 am browser restart.

## First run

The TV shows a **Home Display** screen with an address. Open that address on a phone or computer, create your account, and the TV switches to your display on its own. Then:

1. **Designer**: add and arrange widgets, press **Publish changes**.
2. **Device**: turn on **TV schedule** and set the hours, press **Save device settings**. Use **TV on** and **TV off** to test CEC.
3. **Settings**: connect Google if you want Google Calendar or Sheets ([google-setup.md](google-setup.md)).

## How the Pi finds the display

By default the Pi asks its own server for the first display and opens it (`/kiosk` page). To point it somewhere else, put an address in **Device → Display address**; the Pi then waits for it to be reachable and opens it. That is how a Pi will use a hosted version later.

## Updating

```sh
cd internal-home-display && git pull && sudo ./deploy/pi/install.sh
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Black screen after boot | `journalctl -u home-display-kiosk -e`. Make sure no desktop is running: `systemctl is-active lightdm` should say inactive. |
| "The device agent is not reachable" in the Device page | `systemctl status home-display-agent` |
| TV does not react | `echo "pow 0" \| cec-client -s -d 1` should print a power status. Enable CEC in the TV's settings; use the HDMI port marked ARC or CEC. |
| Admin page does not load | `docker compose -f /opt/home-display/docker-compose.yml logs --tail 50` |
| Wrong time on the TV | Device → Time zone, and `TZ=` in `/opt/home-display/.env`, then `docker compose up -d` |
| Forgot your password | `docker compose -f /opt/home-display/docker-compose.yml down && docker volume rm home-display_home-display-data` resets all data. There is no password reset by email in version 1. |

Data lives in the Docker volume `home-display_home-display-data` (SQLite). Back it up with `docker run --rm -v home-display_home-display-data:/d -v $PWD:/b busybox tar czf /b/home-display-backup.tgz -C /d .`
