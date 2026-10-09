import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAction, useToast } from "./ui";

interface Account { id: string; email: string; provider: string }
interface Token { id: string; name: string; createdAt: string; lastUsedAt: string | null }

export default function SettingsPage() {
  const run = useAction();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [setup, setSetup] = useState({ google: false });
  const [paste, setPaste] = useState("");
  const [loopback, setLoopback] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [tokenName, setTokenName] = useState("");

  const load = useCallback(async () => {
    setAccounts(await api("GET", "/api/accounts"));
    setTokens(await api("GET", "/api/tokens"));
    setSetup(await api("GET", "/api/setup"));
  }, []);
  useEffect(() => {
    run(load);
    const q = new URLSearchParams(location.search);
    if (q.get("google") === "connected") toast("Google account connected");
    if (q.get("google") === "error") toast(`Google sign-in failed: ${q.get("reason")}`, true);
  }, [load, run, toast]);

  return (
    <div className="page">
      <h1>Settings</h1>

      <div className="card">
        <h2>Google accounts</h2>
        <p className="muted small">Used for Google Calendar and for creating Google Sheets for your lists. The app can only open the Sheets it creates, nothing else in Drive.</p>
        {accounts.map((a) => (
          <div key={a.id} className="row" style={{ marginBottom: 6 }}>
            <span className="grow">{a.email}</span>
            <button className="danger ghost" onClick={() => confirm(`Disconnect ${a.email}? Calendars and Sheets using it stop updating.`) && run(async () => { await api("DELETE", `/api/accounts/${a.id}`); await load(); })}>Disconnect</button>
          </div>
        ))}
        {!setup.google ? (
          <p className="small danger">Google is not set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the .env file and restart. See docs/google-setup.md.</p>
        ) : (
          <>
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  const r = await api<{ url: string; loopback: boolean }>("GET", "/api/google/auth-url");
                  setLoopback(r.loopback);
                  window.open(r.url, "_blank");
                })
              }
            >
              Connect a Google account
            </button>
            {loopback && (
              <div style={{ marginTop: 12 }}>
                <p className="small">
                  After you approve access, Google sends your browser to a page that will not load (it starts with <code>http://127.0.0.1:53682</code>). That is expected. Copy the full address from the address bar and paste it here:
                </p>
                <div className="row">
                  <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="http://127.0.0.1:53682/?state=…&code=…" />
                  <button onClick={() => run(async () => { await api("POST", "/api/google/exchange", { url: paste }); setPaste(""); setLoopback(false); await load(); }, "Google account connected")}>Finish</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Access tokens</h2>
        <p className="muted small">For the future mobile app, scripts, and AI tools such as Claude (through the MCP server). A token can do everything you can, so treat it like a password.</p>
        {tokens.map((t) => (
          <div key={t.id} className="row" style={{ marginBottom: 6 }}>
            <span className="grow">{t.name} <span className="muted small">· last used {t.lastUsedAt ?? "never"}</span></span>
            <button className="danger ghost" onClick={() => run(async () => { await api("DELETE", `/api/tokens/${t.id}`); await load(); })}>Revoke</button>
          </div>
        ))}
        <div className="row">
          <input placeholder="Name, e.g. Claude" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
          <button onClick={() => run(async () => { const r = await api<{ token: string }>("POST", "/api/tokens", { name: tokenName || "Token" }); setNewToken(r.token); setTokenName(""); await load(); })}>Create token</button>
        </div>
        {newToken && (
          <p className="small">Copy it now, it is not shown again: <code>{newToken}</code></p>
        )}
      </div>
    </div>
  );
}
