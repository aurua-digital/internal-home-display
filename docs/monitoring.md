# Dynatrace monitoring

OneAgent runs on the Pi itself (not in a container). In full-stack mode it sees the host, every Docker container, processes, and the app's logs.

## Install

1. In Dynatrace, create an API token (**Access tokens → Generate new token**) with only the **Download installer** scope (`InstallerDownload`).
2. On the Pi:

   ```sh
   sudo DT_ENV_URL=https://<your-environment-id>.live.dynatrace.com \
        DT_TOKEN=dt0c01.… \
        /opt/home-display/deploy/pi/install-dynatrace.sh
   ```

3. After a few minutes the host appears under **Infrastructure → Hosts**, in host group `home-display` with tag `app:home-display`. Set `DT_HOST_GROUP` to use another group name.

The script restarts the compose stack afterwards so the app container is picked up.

## What you can watch

- **Host:** CPU, memory (the 4 GB Pi is the thing to watch), SD card space, CPU temperature.
- **Containers:** the `home-display` container's CPU, memory, restarts.
- **Logs:** the API writes one JSON log line per request to stdout; OneAgent ingests container logs when `--set-app-log-content-access=true` (the script sets it).
- **Availability:** the API answers `GET /api/health`. Add a Dynatrace synthetic HTTP monitor against `http://<pi>:8080/api/health` from a private location if you want alerts when the display server is down.

Not covered: OneAgent does not monitor the kiosk browser's page rendering. The Device page shows kiosk status, and the display page keeps its last data on screen when the network drops.

OneAgent only supports 64-bit Linux on ARM, so the Pi must run the 64-bit OS.
