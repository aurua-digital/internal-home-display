#!/bin/sh
# Runs inside the "cage" kiosk compositor (see home-display-kiosk.service).
# Rotates the screen if asked, waits for the display to be reachable, then starts Chromium.
[ -f /etc/home-display/kiosk.env ] && . /etc/home-display/kiosk.env
ROT="${KIOSK_ROTATION:-0}"
LIB=/usr/local/lib/home-display

if [ "$ROT" != "0" ] && command -v wlr-randr >/dev/null 2>&1; then
  OUT="$(wlr-randr | awk '/^[^ ]/ {print $1; exit}')"
  [ -n "$OUT" ] && wlr-randr --output "$OUT" --transform "$ROT"
fi

if [ -z "$KIOSK_URL" ]; then
  # Local mode: the app runs on this Pi. Wait for it (up to 3 minutes after boot), then
  # open the pairing page, which jumps to the first display by itself.
  i=0
  until curl -sf http://127.0.0.1:8080/api/health >/dev/null 2>&1 || [ "$i" -ge 90 ]; do
    i=$((i + 1)); sleep 2
  done
  URL="http://127.0.0.1:8080/kiosk?admin=http://$(hostname).local:8080"
else
  # Explicit address (another machine, or the hosted service later): a local page waits for
  # the network, then opens it, so a slow Wi-Fi at boot never leaves an error page on the TV.
  NEXT="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$KIOSK_URL")"
  URL="file://$LIB/waiting.html?next=$NEXT"
fi

BROWSER="$(command -v chromium || command -v chromium-browser)"
exec "$BROWSER" \
  --kiosk "$URL" \
  --ozone-platform=wayland \
  --user-data-dir=/var/lib/home-display/chromium \
  --no-first-run --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --hide-crash-restore-bubble \
  --disable-features=Translate,InfiniteSessionRestore \
  --disable-pinch --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic --check-for-update-interval=31536000 \
  --allow-file-access-from-files
