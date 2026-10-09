#!/usr/bin/env bash
# Installs the Dynatrace OneAgent on this Pi so the host and the Docker containers show up in
# your Dynatrace tenant. Full-stack mode auto-detects containers and ingests their logs.
#
#   sudo DT_ENV_URL=https://abc12345.live.dynatrace.com DT_TOKEN=dt0c01.… ./install-dynatrace.sh
#
# DT_TOKEN needs the "Download installer" scope (InstallerDownload) and nothing else.
# Requires a 64-bit OS: OneAgent does not support 32-bit Raspberry Pi OS.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run this with sudo." >&2; exit 1; }
: "${DT_ENV_URL:?Set DT_ENV_URL, for example https://abc12345.live.dynatrace.com}"
: "${DT_TOKEN:?Set DT_TOKEN (an API token with the InstallerDownload scope)}"
case "$(uname -m)" in aarch64|arm64) ;; *) echo "OneAgent needs a 64-bit OS." >&2; exit 1 ;; esac

HOST_GROUP="${DT_HOST_GROUP:-home-display}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
INSTALLER="$TMP/oneagent.sh"

echo "Downloading the OneAgent installer from ${DT_ENV_URL%/}…"
curl -fSL --proto '=https' -H "Authorization: Api-Token $DT_TOKEN" \
  "${DT_ENV_URL%/}/api/v1/deployment/installer/agent/unix/default/latest?arch=arm" -o "$INSTALLER"
head -c 2 "$INSTALLER" | grep -q '#!' || { echo "That did not download an installer. Check DT_ENV_URL and the token's scope." >&2; exit 1; }

echo "Installing…"
/bin/sh "$INSTALLER" \
  --set-monitoring-mode=fullstack \
  --set-app-log-content-access=true \
  --set-host-group="$HOST_GROUP" \
  --set-host-tag=app=home-display \
  --set-host-property=hostname="$(hostname)"

# Containers started before OneAgent need a restart to be instrumented.
if [ -f /opt/home-display/docker-compose.yml ]; then
  (cd /opt/home-display && docker compose up -d --force-recreate)
fi
echo "Done. The host appears in Dynatrace in a few minutes under host group '$HOST_GROUP'."
