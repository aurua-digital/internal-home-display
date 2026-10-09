import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";
import { Field, ToastProvider, useAction } from "./ui";

type State = "loading" | "setup" | "login" | "ready";

export function AdminShell() {
  const [state, setState] = useState<State>("loading");
  const refresh = async () => {
    try {
      const s = await api<{ needsSetup: boolean }>("GET", "/api/setup");
      if (s.needsSetup) return setState("setup");
      await api("GET", "/api/auth/me");
      setState("ready");
    } catch {
      setState("login");
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  if (state === "loading") return <div className="center muted">Loading…</div>;
  if (state === "setup" || state === "login") return <ToastProvider><Auth mode={state} onDone={refresh} /></ToastProvider>;

  return (
    <ToastProvider>
      <div className="shell">
        <nav className="nav">
          <div className="brand">🖥️ Home Display</div>
          <NavLink to="/designer">Designer</NavLink>
          <NavLink to="/lists">Lists</NavLink>
          <NavLink to="/device">Device</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <div className="spacer" />
          <button
            className="ghost"
            onClick={async () => {
              await api("POST", "/api/auth/logout");
              setState("login");
            }}
          >
            Sign out
          </button>
        </nav>
        <main>
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}

function Auth({ mode, onDone }: { mode: "setup" | "login"; onDone: () => void }) {
  const run = useAction();
  const [f, setF] = useState({ name: "", email: "", password: "", householdName: "Home" });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("POST", mode === "setup" ? "/api/setup" : "/api/auth/login", f);
      onDone();
    });
  };
  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>{mode === "setup" ? "Welcome 👋" : "Sign in"}</h1>
        <p className="muted">{mode === "setup" ? "Create the admin account for this display." : "Home Display admin"}</p>
        {mode === "setup" && (
          <Field label="Your name">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Password" help={mode === "setup" ? "At least 8 characters" : undefined}>
          <input type="password" required minLength={mode === "setup" ? 8 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <button className="primary" type="submit">{mode === "setup" ? "Create account" : "Sign in"}</button>
      </form>
    </div>
  );
}
