import json
import os
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

os.environ["HD_CONFIG_DIR"] = tempfile.mkdtemp()
os.environ["HD_CRON_FILE"] = os.path.join(os.environ["HD_CONFIG_DIR"], "cron")
import agent  # noqa: E402


class Config(unittest.TestCase):
    def test_cron_has_on_and_off_per_rule_and_nightly_restart(self):
        cfg = agent.validate_config({
            "displayUrl": "http://pi.local:8080/d/abc",
            "tvControl": True,
            "tvSchedule": [{"days": [1, 2, 3, 4, 5], "on": "06:30", "off": "22:00"}, {"days": [0, 6], "on": "08:00", "off": "23:15"}],
        })
        cron = agent.render_cron(cfg)
        self.assertIn("30 6 * * 1,2,3,4,5 root /usr/local/lib/home-display/tv.sh on", cron)
        self.assertIn("0 22 * * 1,2,3,4,5 root /usr/local/lib/home-display/tv.sh off", cron)
        self.assertIn("15 23 * * 0,6 root /usr/local/lib/home-display/tv.sh off", cron)
        self.assertIn("systemctl restart home-display-kiosk.service", cron)

    def test_no_tv_lines_when_tv_control_is_off(self):
        cfg = agent.validate_config({"tvControl": False, "tvSchedule": [{"days": [1], "on": "06:30", "off": "22:00"}]})
        self.assertNotIn("tv.sh", agent.render_cron(cfg))

    def test_rejects_bad_input(self):
        for bad in (
            {"displayUrl": "javascript:alert(1)"},
            {"displayUrl": "http://x/'; reboot #"},
            {"rotation": 45},
            {"tvSchedule": [{"days": [], "on": "06:30", "off": "22:00"}]},
            {"tvSchedule": [{"days": [1], "on": "6:30", "off": "22:00"}]},
            {"tvSchedule": [{"days": [9], "on": "06:30", "off": "22:00"}]},
            {"timezone": "America/Chicago; rm -rf /"},
            {"hostname": "bad host!"},
        ):
            with self.assertRaises(agent.AgentError, msg=str(bad)):
                agent.validate_config(bad)

    def test_kiosk_env(self):
        cfg = agent.validate_config({"displayUrl": "http://pi.local/d/x", "rotation": 90})
        self.assertEqual(agent.render_kiosk_env(cfg), "KIOSK_URL=http://pi.local/d/x\nKIOSK_ROTATION=90\n")


class Cec(unittest.TestCase):
    def test_parse_power(self):
        self.assertEqual(agent.parse_cec_power("TV (0): power status: on"), "on")
        self.assertEqual(agent.parse_cec_power("power status: standby"), "standby")
        self.assertEqual(agent.parse_cec_power("power status: in transition from standby to on"), "turning on")
        self.assertEqual(agent.parse_cec_power("power status: in transition from on to standby"), "turning off")
        self.assertEqual(agent.parse_cec_power("nothing useful"), "unknown")

    def test_tv_on_sends_on_then_active_source(self):
        calls = []
        with mock.patch.object(agent, "cec", side_effect=lambda c, timeout=12: calls.append(c) or (0, "")):
            self.assertEqual(agent.tv_action("on"), {"power": "on"})
            self.assertEqual(calls, ["on 0", "as"])
            calls.clear()
            self.assertEqual(agent.tv_action("off"), {"power": "standby"})
            self.assertEqual(calls, ["standby 0"])


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        agent.Handler.token = "t" * 20
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), agent.Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def call(self, method, path, body=None, token="t" * 20):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method, data=json.dumps(body).encode() if body is not None else None)
        req.add_header("authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_requires_token(self):
        self.assertEqual(self.call("GET", "/config", token="wrong")[0], 401)

    def test_save_config_writes_files_and_returns_it(self):
        with mock.patch.object(agent, "run", return_value=(0, "")):
            code, body = self.call("PUT", "/config", {"displayUrl": "http://pi.local/d/x", "tvControl": True, "tvSchedule": [{"days": [1], "on": "07:00", "off": "21:00"}]})
        self.assertEqual(code, 200)
        self.assertEqual(body["displayUrl"], "http://pi.local/d/x")
        self.assertIn("tv.sh on", open(agent.CRON_FILE).read())
        self.assertIn("KIOSK_URL=http://pi.local/d/x", open(agent.KIOSK_ENV).read())

    def test_bad_config_is_a_400_with_a_message(self):
        code, body = self.call("PUT", "/config", {"rotation": 7})
        self.assertEqual(code, 400)
        self.assertIn("Rotation", body["error"])

    def test_status_shape(self):
        with mock.patch.object(agent, "run", return_value=(1, "")):
            code, body = self.call("GET", "/status")
        self.assertEqual(code, 200)
        for key in ("hostname", "ip", "uptimeSec", "memory", "disk", "kiosk", "tv", "containers"):
            self.assertIn(key, body)


if __name__ == "__main__":
    unittest.main()
