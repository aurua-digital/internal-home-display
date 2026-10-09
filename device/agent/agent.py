#!/usr/bin/env python3
"""Home Display device agent.

Runs on the Raspberry Pi itself (not in Docker) because it controls things only the
real machine can: the kiosk browser, the TV over HDMI-CEC, cron, Wi-Fi and reboot.
The admin app (in a container) talks to it over http://127.0.0.1:8765 with a bearer token.

Standard library only, so it runs on a fresh Raspberry Pi OS with no installs.
"""
import hmac
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONFIG_DIR = os.environ.get("HD_CONFIG_DIR", "/etc/home-display")
CONFIG_FILE = os.path.join(CONFIG_DIR, "device.json")
KIOSK_ENV = os.path.join(CONFIG_DIR, "kiosk.env")
CRON_FILE = os.environ.get("HD_CRON_FILE", "/etc/cron.d/home-display")
LIB_DIR = os.environ.get("HD_LIB_DIR", "/usr/local/lib/home-display")
KIOSK_SERVICE = "home-display-kiosk.service"
DEFAULTS = {
    "displayUrl": "",
    "rotation": 0,
    "tvControl": False,
    "tvSchedule": [],
    "timezone": "",
    "hostname": "",
}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
TZ_RE = re.compile(r"^[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+){0,2}$")
HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$")


class AgentError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def run(args, timeout=15, stdin=None):
    """Run a command without a shell. Returns (exit code, output)."""
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, input=stdin)
        return p.returncode, (p.stdout + p.stderr).strip()
    except FileNotFoundError:
        return 127, f"{args[0]} is not installed"
    except subprocess.TimeoutExpired:
        return 124, f"{args[0]} timed out"


# ---------------------------------------------------------------- config

def load_config():
    cfg = dict(DEFAULTS)
    try:
        with open(CONFIG_FILE) as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        pass
    if not cfg["hostname"]:
        cfg["hostname"] = socket.gethostname()
    return cfg


def validate_config(raw):
    """Check user input and return a clean config. Raises AgentError on bad input."""
    cfg = dict(DEFAULTS)
    url = str(raw.get("displayUrl", "")).strip()
    if url and not re.match(r"^https?://[^\s'\"\\$`]+$", url):
        raise AgentError("Display address must be an http:// or https:// link")
    cfg["displayUrl"] = url
    try:
        rotation = int(raw.get("rotation", 0))
    except (TypeError, ValueError):
        rotation = -1
    if rotation not in (0, 90, 180, 270):
        raise AgentError("Rotation must be 0, 90, 180 or 270")
    cfg["rotation"] = rotation
    cfg["tvControl"] = bool(raw.get("tvControl", False))
    schedule = []
    for rule in raw.get("tvSchedule", []) or []:
        days = sorted({int(d) for d in rule.get("days", [])})
        if not days or any(d < 0 or d > 6 for d in days):
            raise AgentError("Each TV schedule needs at least one day")
        if not TIME_RE.match(str(rule.get("on", ""))) or not TIME_RE.match(str(rule.get("off", ""))):
            raise AgentError("TV schedule times must look like 06:30")
        schedule.append({"days": days, "on": rule["on"], "off": rule["off"]})
    cfg["tvSchedule"] = schedule
    tz = str(raw.get("timezone", "")).strip()
    if tz and not TZ_RE.match(tz):
        raise AgentError("Unknown time zone format. Use something like America/Chicago")
    cfg["timezone"] = tz
    host = str(raw.get("hostname", "")).strip().lower()
    if host and not HOST_RE.match(host):
        raise AgentError("Hostname can only use letters, numbers and dashes")
    cfg["hostname"] = host
    return cfg


def render_cron(cfg):
    """/etc/cron.d file: TV on/off schedule plus a nightly browser restart (clears memory leaks)."""
    lines = [
        "# Managed by the Home Display device agent. Edit in the admin app, not here.",
        "SHELL=/bin/sh",
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        f"0 4 * * * root systemctl restart {KIOSK_SERVICE}",
    ]
    if cfg["tvControl"]:
        for rule in cfg["tvSchedule"]:
            days = ",".join(str(d) for d in rule["days"])
            for action, key in (("on", "on"), ("off", "off")):
                hh, mm = rule[key].split(":")
                lines.append(f"{int(mm)} {int(hh)} * * {days} root {LIB_DIR}/tv.sh {action}")
    return "\n".join(lines) + "\n"


def render_kiosk_env(cfg):
    return f"KIOSK_URL={cfg['displayUrl']}\nKIOSK_ROTATION={cfg['rotation']}\n"


def write_atomic(path, text, mode=0o644):
    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        f.write(text)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def apply_config(cfg, previous):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    write_atomic(CONFIG_FILE, json.dumps(cfg, indent=2))
    write_atomic(KIOSK_ENV, render_kiosk_env(cfg))
    write_atomic(CRON_FILE, render_cron(cfg))
    if cfg["timezone"] and cfg["timezone"] != previous.get("timezone"):
        code, out = run(["timedatectl", "set-timezone", cfg["timezone"]])
        if code != 0:
            raise AgentError(f"Could not set time zone: {out}", 500)
    if cfg["hostname"] and cfg["hostname"] != socket.gethostname():
        run(["hostnamectl", "set-hostname", cfg["hostname"]])
    changed = (cfg["displayUrl"], cfg["rotation"]) != (previous.get("displayUrl"), previous.get("rotation"))
    if changed and cfg["displayUrl"]:
        run(["systemctl", "restart", KIOSK_SERVICE])


# ---------------------------------------------------------------- TV (HDMI-CEC)

def parse_cec_power(output):
    m = re.search(r"power status:\s*(\w[\w ]*)", output)
    if not m:
        return "unknown"
    s = m.group(1).strip().lower()
    if "transition" in s:
        return "turning on" if s.endswith("to on") else "turning off"
    if s.startswith("on"):
        return "on"
    if "standby" in s:
        return "standby"
    return s


_tv_cache = {"at": 0.0, "value": "unknown"}
_tv_lock = threading.Lock()


def cec(command, timeout=12):
    # flock: the schedule (cron) and this agent must not talk to the CEC adapter at the same time.
    return run(["flock", "-w", "20", "/run/home-display-cec.lock", "cec-client", "-s", "-d", "1"], timeout=timeout, stdin=command + "\n")


def tv_power(fresh=False):
    with _tv_lock:
        if not fresh and time.time() - _tv_cache["at"] < 30:
            return _tv_cache["value"]
        code, out = cec("pow 0")
        value = "unavailable" if code == 127 else parse_cec_power(out)
        _tv_cache.update(at=time.time(), value=value)
        return value


def tv_action(action):
    if action == "status":
        return {"power": tv_power(fresh=True)}
    with _tv_lock:
        if action == "on":
            code, out = cec("on 0")
            cec("as")  # make the Pi the active HDMI input
        else:
            code, out = cec("standby 0")
        if code == 127:
            raise AgentError("cec-client is not installed (package cec-utils)", 500)
        _tv_cache.update(at=time.time(), value="on" if action == "on" else "standby")
    return {"power": _tv_cache["value"]}


# ---------------------------------------------------------------- status

def read(path, default=""):
    try:
        with open(path) as f:
            return f.read()
    except OSError:
        return default


def status():
    meminfo = {}
    for line in read("/proc/meminfo").splitlines():
        k, _, v = line.partition(":")
        meminfo[k] = int(v.split()[0]) if v.split() else 0
    total_mb = meminfo.get("MemTotal", 0) // 1024
    used_mb = total_mb - meminfo.get("MemAvailable", 0) // 1024
    disk = shutil.disk_usage("/")
    temp = read("/sys/class/thermal/thermal_zone0/temp").strip()
    ip = "unknown"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        pass
    containers = []
    code, out = run(["docker", "ps", "--format", "{{.Names}}|{{.Status}}"], timeout=8)
    if code == 0:
        for line in out.splitlines():
            name, _, st = line.partition("|")
            containers.append({"name": name, "status": st})
    return {
        "hostname": socket.gethostname(),
        "ip": ip,
        "uptimeSec": int(float(read("/proc/uptime", "0").split()[0])),
        "cpuTempC": int(temp) / 1000 if temp.isdigit() else None,
        "load1": float(read("/proc/loadavg", "0").split()[0]),
        "memory": {"usedMb": used_mb, "totalMb": total_mb},
        "disk": {"usedGb": round(disk.used / 1e9, 1), "totalGb": round(disk.total / 1e9, 1)},
        "kiosk": {"running": run(["systemctl", "is-active", "--quiet", KIOSK_SERVICE])[0] == 0},
        "tv": {"power": tv_power() if load_config()["tvControl"] else "not managed"},
        "containers": containers,
    }


def connect_wifi(ssid, password):
    if not ssid or len(ssid) > 32 or len(password) > 63:
        raise AgentError("Enter the network name and password")
    code, out = run(["nmcli", "device", "wifi", "connect", ssid, "password", password], timeout=40)
    if code != 0:
        raise AgentError(f"Could not join Wi-Fi: {out}", 500)


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "HomeDisplayAgent"
    token = ""

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status_code, body):
        data = json.dumps(body).encode()
        self.send_response(status_code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self):
        got = self.headers.get("authorization", "")
        want = f"Bearer {self.token}"
        return bool(self.token) and hmac.compare_digest(got.encode(), want.encode())

    def _body(self):
        n = int(self.headers.get("content-length") or 0)
        if n > 65536:
            raise AgentError("Request too large", 413)
        return json.loads(self.rfile.read(n) or b"{}")

    def _dispatch(self, method):
        if not self._authorized():
            return self._send(401, {"error": "Unauthorized"})
        try:
            path = self.path.split("?")[0].rstrip("/")
            if method == "GET" and path == "/status":
                return self._send(200, status())
            if method == "GET" and path == "/config":
                return self._send(200, load_config())
            if method == "PUT" and path == "/config":
                body = self._body()
                previous = load_config()
                if "wifi" in body:
                    connect_wifi(str(body["wifi"].get("ssid", "")), str(body["wifi"].get("password", "")))
                    if len(body) == 1:
                        return self._send(200, previous)
                merged = {**previous, **{k: v for k, v in body.items() if k != "wifi"}}
                cfg = validate_config(merged)
                apply_config(cfg, previous)
                return self._send(200, load_config())
            if method == "POST" and path.startswith("/tv/"):
                action = path.split("/")[2]
                if action not in ("on", "off", "status"):
                    raise AgentError("Unknown TV action", 404)
                return self._send(200, tv_action(action))
            if method == "POST" and path == "/kiosk/restart":
                run(["systemctl", "restart", KIOSK_SERVICE])
                return self._send(200, {"ok": True})
            if method == "POST" and path == "/reboot":
                self._send(200, {"ok": True})
                threading.Timer(1.0, lambda: run(["systemctl", "reboot"])).start()
                return
            raise AgentError("Not found", 404)
        except AgentError as e:
            self._send(e.status, {"error": str(e)})
        except json.JSONDecodeError:
            self._send(400, {"error": "Invalid JSON"})
        except Exception as e:  # never let a bug kill the agent
            sys.stderr.write(f"error: {e!r}\n")
            self._send(500, {"error": "Internal error"})

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")


def main():
    token = os.environ.get("HOST_AGENT_TOKEN", "")
    if len(token) < 16:
        sys.exit("HOST_AGENT_TOKEN must be set (at least 16 characters)")
    Handler.token = token
    host = os.environ.get("HD_AGENT_HOST", "127.0.0.1")
    port = int(os.environ.get("HD_AGENT_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Home Display agent listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
