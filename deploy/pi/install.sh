#!/usr/bin/env bash
# Sets up a Raspberry Pi as a Home Display: installs Docker and the kiosk, starts the app.
#
#   git clone <this repo> && cd internal-home-display && sudo ./deploy/pi/install.sh
#
# Safe to run again: it updates files and restarts services, and keeps your .env and data.
# Needs: Raspberry Pi OS Lite (64-bit, Bookworm or newer) and an internet connection.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run this with sudo." >&2; exit 1; fi
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR=/opt/home-display
LIB=/usr/local/lib/home-display
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

case "$(uname -m)" in
  aarch64|arm64) ;;
  *) echo "This needs a 64-bit OS (aarch64). Re-flash with Raspberry Pi OS Lite (64-bit)." >&2; exit 1 ;;
esac
command -v apt-get >/dev/null || { echo "This installer needs a Debian-based OS (Raspberry Pi OS)." >&2; exit 1; }

say "Installing packages (browser, kiosk compositor, HDMI-CEC tools)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
CHROMIUM=chromium; apt-cache show chromium >/dev/null 2>&1 || CHROMIUM=chromium-browser
apt-get install -y --no-install-recommends \
  ca-certificates curl git python3 cage wlr-randr cec-utils util-linux jq \
  "$CHROMIUM" fonts-noto-color-emoji fonts-inter network-manager

if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "Copying the app to $APP_DIR"
mkdir -p "$APP_DIR"
# Keep .env and anything the user added; replace code.
tar -C "$REPO" --exclude=.git --exclude=node_modules --exclude=dist --exclude=.env --exclude=data -cf - . | tar -C "$APP_DIR" -xf -

say "Creating settings"
mkdir -p /etc/home-display
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  TZ_NOW="$(timedatectl show -p Timezone --value 2>/dev/null || echo UTC)"
  sed -i "s|^APP_SECRET=.*|APP_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '=+/\n')|" "$APP_DIR/.env"
  sed -i "s|^HOST_AGENT_TOKEN=.*|HOST_AGENT_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '=+/\n')|" "$APP_DIR/.env"
  sed -i "s|^TZ=.*|TZ=$TZ_NOW|" "$APP_DIR/.env"
fi
TOKEN="$(grep '^HOST_AGENT_TOKEN=' "$APP_DIR/.env" | cut -d= -f2-)"
printf 'HOST_AGENT_TOKEN=%s\n' "$TOKEN" > /etc/home-display/agent.env
chmod 600 /etc/home-display/agent.env
[ -f /etc/home-display/kiosk.env ] || printf 'KIOSK_URL=\nKIOSK_ROTATION=0\n' > /etc/home-display/kiosk.env
[ -f /etc/home-display/device.json ] || echo '{}' > /etc/home-display/device.json

say "Installing the device agent and kiosk"
install -d "$LIB"
install -m 0755 "$APP_DIR/device/agent/agent.py" "$LIB/agent.py"
install -m 0755 "$APP_DIR/device/kiosk/kiosk-session.sh" "$LIB/kiosk-session.sh"
install -m 0755 "$APP_DIR/device/kiosk/tv.sh" "$LIB/tv.sh"
install -m 0644 "$APP_DIR/device/kiosk/waiting.html" "$LIB/waiting.html"
install -m 0644 "$APP_DIR/device/systemd/home-display-agent.service" /etc/systemd/system/
install -m 0644 "$APP_DIR/device/systemd/home-display-kiosk.service" /etc/systemd/system/
# Make sure the cron file exists with the nightly restart even before anyone opens the admin app.
[ -f /etc/cron.d/home-display ] || cat > /etc/cron.d/home-display <<CRON
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 4 * * * root systemctl restart home-display-kiosk.service
CRON

id hdkiosk >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/home-display --shell /usr/sbin/nologin hdkiosk
usermod -aG video,render,input hdkiosk
install -d -o hdkiosk -g hdkiosk /var/lib/home-display/chromium

# The Pi desktop (if present) fights the kiosk for the screen. This turns it off.
for dm in lightdm gdm3 sddm; do systemctl disable --now "$dm" 2>/dev/null || true; done
systemctl set-default multi-user.target >/dev/null
systemctl disable --now getty@tty1.service 2>/dev/null || true

say "Starting the app (the first build takes a few minutes on a Pi)"
cd "$APP_DIR"
docker compose up -d --build

systemctl daemon-reload
systemctl enable --now home-display-agent.service
systemctl enable home-display-kiosk.service
systemctl restart home-display-kiosk.service

say "Waiting for the app"
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8080/api/health >/dev/null && break
  sleep 2
done

HOST="$(hostname)"
cat <<DONE

  Home Display is running.

  1. On your phone or computer (same network), open:   http://$HOST.local:8080
     (or http://$(hostname -I | awk '{print $1}'):8080)
  2. Create your account, then design the screen in the Designer.
  3. The TV shows your display automatically as soon as it exists.

  Optional:  Google Calendar and Sheets     docs/google-setup.md
             Dynatrace monitoring           sudo $APP_DIR/deploy/pi/install-dynatrace.sh

DONE
