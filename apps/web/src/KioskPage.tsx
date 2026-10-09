import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * What a brand new Pi shows. It keeps asking the local server for a display and jumps to it
 * as soon as one exists, so finishing setup on a phone makes the TV light up by itself.
 */
export default function KioskPage() {
  const admin = new URLSearchParams(location.search).get("admin") || location.origin;
  const [status, setStatus] = useState("Starting…");

  useEffect(() => {
    document.documentElement.style.cssText = "background:#0f172a;cursor:none";
    let stop = false;
    const tick = async () => {
      try {
        const r = await api<{ path: string }>("GET", "/api/pair/local");
        location.replace(r.path);
        return;
      } catch (e) {
        if (!stop) setStatus((e as any).status === 404 ? "Waiting for setup" : "Connecting to the server…");
      }
      if (!stop) setTimeout(tick, 3000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#e5ecf8", fontFamily: "Inter, system-ui, sans-serif", textAlign: "center", padding: 40 }}>
      <div>
        <div style={{ fontSize: 72, marginBottom: 12 }}>🖥️</div>
        <div style={{ fontSize: 44, fontWeight: 600 }}>Home Display</div>
        <div style={{ fontSize: 28, color: "#94a3b8", margin: "18px 0 34px" }}>{status}</div>
        <div style={{ fontSize: 26 }}>
          To finish setup, open this address on your phone or computer:
          <div style={{ marginTop: 14, fontSize: 40, color: "#38bdf8", fontWeight: 600 }}>{admin}</div>
        </div>
      </div>
    </div>
  );
}
