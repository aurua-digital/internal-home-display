import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Field, useAction } from "./ui";

interface Rule { days: number[]; on: string; off: string }
interface Config { displayUrl: string; rotation: number; tvControl: boolean; tvSchedule: Rule[]; timezone: string; hostname: string }
interface Status {
  hostname: string; ip: string; uptimeSec: number; cpuTempC: number | null; load1: number;
  memory: { usedMb: number; totalMb: number }; disk: { usedGb: number; totalGb: number };
  kiosk: { running: boolean }; tv: { power: string };
  containers: { name: string; status: string }[];
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DevicePage() {
  const run = useAction();
  const [status, setStatus] = useState<Status | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [offline, setOffline] = useState("");
  const [wifi, setWifi] = useState({ ssid: "", password: "" });

  const load = useCallback(async () => {
    try {
      setStatus(await api("GET", "/api/device/status"));
      setCfg(await api("GET", "/api/device/config"));
      setOffline("");
    } catch (e) {
      setOffline((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => api<Status>("GET", "/api/device/status").then(setStatus).catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (offline)
    return (
      <div className="page">
        <h1>Device</h1>
        <div className="card">
          <p className="danger">{offline}</p>
          <p className="muted small">This page controls the Raspberry Pi the TV is plugged into. It works once the device agent from <code>device/</code> is installed on the Pi (the install script does this).</p>
          <button onClick={load}>Try again</button>
        </div>
      </div>
    );
  if (!status || !cfg) return <div className="page muted">Loading…</div>;

  const setRule = (i: number, p: Partial<Rule>) => setCfg({ ...cfg, tvSchedule: cfg.tvSchedule.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const up = Math.floor(status.uptimeSec / 3600);

  return (
    <div className="page">
      <h1>Device</h1>
      <p className="muted">{status.hostname} · {status.ip} · up {up >= 48 ? `${Math.floor(up / 24)} days` : `${up} h`}</p>

      <div className="card">
        <h2>Health</h2>
        <table>
          <tbody>
            <tr><td>Kiosk browser</td><td className={status.kiosk.running ? "ok" : "danger"}>{status.kiosk.running ? "Running" : "Not running"}</td></tr>
            <tr><td>TV power</td><td>{status.tv.power}</td></tr>
            <tr><td>CPU temperature</td><td>{status.cpuTempC === null ? "n/a" : `${status.cpuTempC.toFixed(0)} °C`}</td></tr>
            <tr><td>Load (1 min)</td><td>{status.load1.toFixed(2)}</td></tr>
            <tr><td>Memory</td><td>{status.memory.usedMb} / {status.memory.totalMb} MB</td></tr>
            <tr><td>Disk</td><td>{status.disk.usedGb} / {status.disk.totalGb} GB</td></tr>
            {status.containers.map((c) => <tr key={c.name}><td>Container {c.name}</td><td>{c.status}</td></tr>)}
          </tbody>
        </table>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button onClick={() => run(async () => { await api("POST", "/api/device/tv/on"); await load(); }, "TV turned on")}>TV on</button>
          <button onClick={() => run(async () => { await api("POST", "/api/device/tv/off"); await load(); }, "TV put on standby")}>TV off</button>
          <button onClick={() => run(() => api("POST", "/api/device/kiosk/restart"), "Browser restarting")}>Restart browser</button>
          <button className="danger" onClick={() => confirm("Reboot the Pi? The display is blank for about a minute.") && run(() => api("POST", "/api/device/reboot"), "Rebooting…")}>Reboot Pi</button>
        </div>
      </div>

      <div className="card">
        <h2>Display</h2>
        <Field label="Display address" help="Leave empty to show this Pi's first display automatically. Or paste an address from the Designer.">
          <input value={cfg.displayUrl} onChange={(e) => setCfg({ ...cfg, displayUrl: e.target.value })} />
        </Field>
        <Field label="Screen rotation">
          <select value={cfg.rotation} onChange={(e) => setCfg({ ...cfg, rotation: Number(e.target.value) })}>
            <option value={0}>Normal</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option>
          </select>
        </Field>
        <Field label="Time zone" help="e.g. America/Chicago">
          <input value={cfg.timezone} onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })} />
        </Field>
        <Field label="Hostname">
          <input value={cfg.hostname} onChange={(e) => setCfg({ ...cfg, hostname: e.target.value })} />
        </Field>
      </div>

      <div className="card">
        <h2>TV schedule</h2>
        <label className="check">
          <input type="checkbox" checked={cfg.tvControl} onChange={(e) => setCfg({ ...cfg, tvControl: e.target.checked })} />
          Turn the TV on and off automatically (HDMI-CEC)
        </label>
        {cfg.tvControl && (
          <>
            {cfg.tvSchedule.map((r, i) => (
              <div key={i} className="row wrap" style={{ marginBottom: 10 }}>
                <div className="chips">
                  {DAYS.map((d, n) => (
                    <button key={d} type="button" className={`chip ${r.days.includes(n) ? "primary" : "ghost"}`} onClick={() => setRule(i, { days: r.days.includes(n) ? r.days.filter((x) => x !== n) : [...r.days, n].sort() })}>{d}</button>
                  ))}
                </div>
                <span>on</span><input type="time" style={{ width: 120 }} value={r.on} onChange={(e) => setRule(i, { on: e.target.value })} />
                <span>off</span><input type="time" style={{ width: 120 }} value={r.off} onChange={(e) => setRule(i, { off: e.target.value })} />
                <button className="ghost danger" onClick={() => setCfg({ ...cfg, tvSchedule: cfg.tvSchedule.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button onClick={() => setCfg({ ...cfg, tvSchedule: [...cfg.tvSchedule, { days: [0, 1, 2, 3, 4, 5, 6], on: "06:30", off: "22:00" }] })}>＋ Add a schedule</button>
          </>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => run(async () => setCfg(await api("PUT", "/api/device/config", cfg)), "Saved to the Pi")}>Save device settings</button>
        </div>
      </div>

      <div className="card">
        <h2>Wi-Fi</h2>
        <div className="row wrap">
          <input style={{ width: 220 }} placeholder="Network name" value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} />
          <input style={{ width: 220 }} type="password" placeholder="Password" value={wifi.password} onChange={(e) => setWifi({ ...wifi, password: e.target.value })} />
          <button onClick={() => run(async () => { await api("PUT", "/api/device/config", { wifi }); setWifi({ ssid: "", password: "" }); }, "Wi-Fi saved")}>Connect</button>
        </div>
        <p className="small muted">You will lose this page if the Pi changes network.</p>
      </div>
    </div>
  );
}
