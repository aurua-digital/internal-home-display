#!/bin/sh
# Turn the TV on or off over HDMI-CEC. Used by the schedule (cron) and the device agent.
# flock stops two callers from using the CEC adapter at once.
cec() { echo "$1" | flock -w 20 /run/home-display-cec.lock cec-client -s -d 1 >/dev/null 2>&1; }
case "$1" in
  on)  cec "on 0"; cec "as" ;;   # power on, then make the Pi the active HDMI input
  off) cec "standby 0" ;;
  *)   echo "usage: tv.sh on|off" >&2; exit 2 ;;
esac
