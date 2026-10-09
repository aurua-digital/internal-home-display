import { useCallback, useEffect, useState } from "react";
import type { ListInfo, ListItem } from "@hd/modules";
import { api } from "../api";
import { Field, useAction } from "./ui";

interface Account { id: string; email: string }
const KIND_LABEL: Record<string, string> = { todo: "To-do", shopping: "Shopping", meals: "Weekly meals", custom: "Custom" };

export default function ListsPage() {
  const run = useAction();
  const [lists, setLists] = useState<ListInfo[]>([]);
  const [id, setId] = useState("");
  const [newKind, setNewKind] = useState("todo");
  const [newName, setNewName] = useState("");

  const load = useCallback(
    async (keep?: string) => {
      const all = await api<ListInfo[]>("GET", "/api/lists");
      setLists(all);
      setId(all.find((l) => l.id === (keep ?? id))?.id ?? all[0]?.id ?? "");
    },
    [id],
  );
  useEffect(() => {
    run(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <h1>Lists</h1>
      <p className="muted">To-dos, shopping and the weekly dinners. Show them on the display with a List widget. Link a list to a Google Sheet so everyone can edit it from their phone.</p>
      <div className="row wrap" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ width: 260 }}>
          {lists.map((l) => (
            <div key={l.id}>
              <button className={id === l.id ? "primary" : "ghost"} style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }} onClick={() => setId(l.id)}>
                {l.name} {l.sheetUrl && <span title="Linked to Google Sheets">📄</span>}
              </button>
            </div>
          ))}
          <h3>New list</h3>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)} style={{ marginBottom: 6 }}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ marginBottom: 6 }} />
          <button onClick={() => run(async () => { const l = await api<ListInfo>("POST", "/api/lists", { kind: newKind, name: newName }); setNewName(""); await load(l.id); })}>Create</button>
        </div>
        <div className="grow">{id && <Editor key={id} listId={id} onChanged={() => load(id)} onDeleted={() => load("")} />}</div>
      </div>
    </div>
  );
}

function Editor({ listId, onChanged, onDeleted }: { listId: string; onChanged: () => void; onDeleted: () => void }) {
  const run = useAction();
  const [data, setData] = useState<{ list: ListInfo; items: ListItem[] } | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [share, setShare] = useState("");

  const load = useCallback(async () => {
    const d = await api<{ list: ListInfo; items: ListItem[] }>("GET", `/api/lists/${listId}`);
    setData(d);
    setName(d.list.name);
  }, [listId]);
  useEffect(() => {
    run(load);
    api<Account[]>("GET", "/api/accounts").then((a) => { setAccounts(a); setAccountId(a[0]?.id ?? ""); }).catch(() => {});
  }, [load, run]);

  if (!data) return <div className="card muted">Loading…</div>;
  const { list, items } = data;
  const apply = (next: ListItem[]) => setData({ ...data, items: next });
  const edit = (itemId: string, p: Partial<ListItem>) => apply(items.map((i) => (i.id === itemId ? { ...i, ...p } : i)));
  const persist = (itemId: string, p: Partial<ListItem>) => run(async () => apply((await api<{ items: ListItem[] }>("PATCH", `/api/lists/${listId}/items/${itemId}`, p)).items));
  const labelName = list.kind === "shopping" ? "Category" : "Notes";

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== list.name && run(async () => { await api("PUT", `/api/lists/${listId}`, { name }); onChanged(); })} style={{ fontSize: 18, fontWeight: 600 }} />
        <button className="danger" onClick={() => confirm(`Delete "${list.name}"? ${list.sheetUrl ? "The Google Sheet is kept." : ""}`) && run(async () => { await api("DELETE", `/api/lists/${listId}`); onDeleted(); })}>Delete</button>
      </div>

      {items.map((i) => (
        <div key={i.id} className="listitem">
          {list.kind !== "meals" && <input type="checkbox" checked={i.done} onChange={(e) => { edit(i.id, { done: e.target.checked }); persist(i.id, { done: e.target.checked }); }} />}
          {list.kind === "meals" && <div style={{ width: 100 }} className="muted">{i.label}</div>}
          <input type="text" value={i.text} placeholder={list.kind === "meals" ? "What's for dinner?" : ""} onChange={(e) => edit(i.id, { text: e.target.value })} onBlur={() => persist(i.id, { text: i.text })} />
          {list.kind !== "meals" && list.kind !== "todo" && (
            <input type="text" style={{ width: 130, flex: "none" }} value={i.label} placeholder={labelName} onChange={(e) => edit(i.id, { label: e.target.value })} onBlur={() => persist(i.id, { label: i.label })} />
          )}
          {list.kind !== "meals" && <button className="ghost danger" onClick={() => run(async () => apply((await api<{ items: ListItem[] }>("DELETE", `/api/lists/${listId}/items/${i.id}`)).items))}>✕</button>}
        </div>
      ))}

      {list.kind === "meals" ? (
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => confirm("Clear every day?") && run(async () => apply((await api<{ items: ListItem[] }>("PUT", `/api/lists/${listId}/items`, { items: items.map((i) => ({ ...i, text: "" })) })).items))}>Clear the week</button>
        </div>
      ) : (
        <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; run(async () => { apply((await api<{ items: ListItem[] }>("POST", `/api/lists/${listId}/items`, { text, label })).items); setText(""); setLabel(""); }); }}>
          <input placeholder="Add an item and press Enter" value={text} onChange={(e) => setText(e.target.value)} />
          {list.kind !== "todo" && <input style={{ width: 130, flex: "none" }} placeholder={labelName} value={label} onChange={(e) => setLabel(e.target.value)} />}
          <button className="primary" type="submit">Add</button>
        </form>
      )}
      {list.kind !== "meals" && items.some((i) => i.done) && (
        <button style={{ marginTop: 10 }} onClick={() => run(async () => apply((await api<{ items: ListItem[] }>("PUT", `/api/lists/${listId}/items`, { items: items.filter((i) => !i.done) })).items))}>Clear completed</button>
      )}

      <h3>Edit in Google Sheets</h3>
      {list.sheetUrl ? (
        <>
          <p className="small">This list lives in a Google Sheet. Edits there show on the TV within a minute.</p>
          <div className="row">
            <a className="btn" href={list.sheetUrl} target="_blank" rel="noreferrer">Open the Sheet</a>
            <button onClick={() => run(load)}>Refresh</button>
            <button className="ghost" onClick={() => confirm("Stop syncing? The list keeps its items inside the app and the Sheet stays in Google Drive.") && run(async () => { await api("DELETE", `/api/lists/${listId}/sheet`); await load(); onChanged(); }, "Unlinked")}>Stop syncing</button>
          </div>
        </>
      ) : accounts.length === 0 ? (
        <p className="small muted">Connect a Google account in Settings to create a Sheet for this list.</p>
      ) : (
        <>
          <Field label="Google account">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </Field>
          <Field label="Share with (emails, comma separated)" help="They get edit access to the Sheet.">
            <input value={share} onChange={(e) => setShare(e.target.value)} placeholder="partner@example.com" />
          </Field>
          <button className="primary" onClick={() => run(async () => { await api("POST", `/api/lists/${listId}/sheet`, { accountId, shareWith: share.split(",") }); await load(); onChanged(); }, "Google Sheet created")}>
            Create a Google Sheet for this list
          </button>
        </>
      )}
    </div>
  );
}
