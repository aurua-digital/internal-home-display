import { useEffect, useState } from "react";
import type { CalendarSourceRef, ListInfo, SettingField } from "@hd/modules";
import { api } from "../api";
import { Field, useAction } from "./ui";

const PALETTE = ["#38bdf8", "#f472b6", "#4ade80", "#fbbf24", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

/** Renders any module's settings from its manifest, so new modules need no form code. */
export function SettingsForm({ fields, values, onChange }: { fields: SettingField[]; values: Record<string, any>; onChange: (key: string, value: unknown) => void }) {
  return (
    <>
      {fields.map((f) => {
        const v = values[f.key];
        const set = (x: unknown) => onChange(f.key, x);
        if (f.type === "boolean")
          return (
            <label key={f.key} className="check">
              <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} />
              {f.label}
            </label>
          );
        return (
          <Field key={f.key} label={f.label} help={f.help}>
            {f.type === "text" && <input value={v ?? ""} onChange={(e) => set(e.target.value)} />}
            {f.type === "textarea" && <textarea rows={3} value={v ?? ""} onChange={(e) => set(e.target.value)} />}
            {f.type === "number" && (
              <input type="number" step="any" min={f.min} max={f.max} value={v ?? ""} onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))} />
            )}
            {f.type === "select" && (
              <select value={String(v ?? "")} onChange={(e) => set(e.target.value)}>
                {f.options!.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {f.type === "color" && (
              <div className="row">
                <input type="color" value={v || "#000000"} onChange={(e) => set(e.target.value)} />
                <button type="button" className="ghost" onClick={() => set("")}>Default</button>
              </div>
            )}
            {f.type === "list" && <ListPicker value={v} onChange={set} />}
            {f.type === "calendars" && <CalendarsField value={v ?? []} onChange={set} />}
            {f.type === "location" && <LocationField value={v} onChange={set} />}
          </Field>
        );
      })}
    </>
  );
}

function ListPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [lists, setLists] = useState<ListInfo[]>([]);
  useEffect(() => {
    api<ListInfo[]>("GET", "/api/lists").then(setLists).catch(() => {});
  }, []);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a list…</option>
      {lists.map((l) => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
    </select>
  );
}

function LocationField({ value, onChange }: { value: { name: string } | null; onChange: (v: unknown) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; latitude: number; longitude: number }[]>([]);
  const run = useAction();
  return (
    <div>
      {value && <div className="small" style={{ marginBottom: 6 }}>📍 {value.name}</div>}
      <div className="row">
        <input
          placeholder="Search a city…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run(async () => setResults(await api("GET", `/api/geocode?q=${encodeURIComponent(q)}`)));
            }
          }}
        />
        <button type="button" onClick={() => run(async () => setResults(await api("GET", `/api/geocode?q=${encodeURIComponent(q)}`)))}>Search</button>
      </div>
      {results.map((r) => (
        <div key={`${r.latitude},${r.longitude}`}>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              onChange(r);
              setResults([]);
              setQ("");
            }}
          >
            {r.name}
          </button>
        </div>
      ))}
    </div>
  );
}

interface Account { id: string; provider: string; email: string }

function CalendarsField({ value, onChange }: { value: CalendarSourceRef[]; onChange: (v: CalendarSourceRef[]) => void }) {
  const run = useAction();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [available, setAvailable] = useState<{ id: string; name: string; color: string }[]>([]);
  const [ics, setIcs] = useState({ name: "", url: "" });
  useEffect(() => {
    api<Account[]>("GET", "/api/accounts").then((a) => {
      setAccounts(a);
      if (a[0]) setAccountId(a[0].id);
    }).catch(() => {});
  }, []);
  const color = () => PALETTE[value.length % PALETTE.length];
  const has = (id: string) => value.some((s) => s.id === id);
  return (
    <div>
      {value.map((s, i) => (
        <div key={s.id} className="row" style={{ marginBottom: 6 }}>
          <input type="color" value={s.color} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
          <div className="grow small">
            {s.name}
            <div className="muted">{s.type === "google" ? "Google" : "Link"}</div>
          </div>
          <button type="button" className="danger ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <h3>Add from Google</h3>
      {accounts.length === 0 ? (
        <div className="small muted">Connect a Google account in Settings first.</div>
      ) : (
        <>
          <div className="row">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
            <button type="button" onClick={() => run(async () => setAvailable(await api("GET", `/api/accounts/${accountId}/calendars`)))}>Load</button>
          </div>
          {available.map((c) => (
            <label key={c.id} className="check" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={has(c.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, { type: "google", id: c.id, accountId, name: c.name, color: c.color }] : value.filter((s) => s.id !== c.id))
                }
              />
              <span style={{ color: c.color }}>●</span> {c.name}
            </label>
          ))}
        </>
      )}
      <h3>Add a calendar link (ICS)</h3>
      <input placeholder="Name" value={ics.name} onChange={(e) => setIcs({ ...ics, name: e.target.value })} style={{ marginBottom: 6 }} />
      <input placeholder="https://… .ics or webcal://…" value={ics.url} onChange={(e) => setIcs({ ...ics, url: e.target.value })} style={{ marginBottom: 6 }} />
      <button
        type="button"
        disabled={!ics.url.trim()}
        onClick={() => {
          onChange([...value, { type: "ics", id: ics.url.trim(), name: ics.name.trim() || "Calendar", color: color() }]);
          setIcs({ name: "", url: "" });
        }}
      >
        Add link
      </button>
    </div>
  );
}
