import { LIST_PRESETS, type ListInfo, type ListItem } from "@hd/modules";
import { newId } from "./crypto.ts";
import { tx, type DB } from "./db.ts";
import type { Google } from "./google.ts";

interface ListRow {
  id: string;
  household_id: string;
  name: string;
  kind: ListInfo["kind"];
  sheet_id: string | null;
  sheet_url: string | null;
  sheet_account_id: string | null;
}

export interface ItemInput {
  text?: string;
  done?: boolean;
  label?: string;
}

const KINDS = Object.keys(LIST_PRESETS) as ListInfo["kind"][];
const SHEET_CACHE_MS = 30_000;
const TRUTHY = new Set(["true", "yes", "y", "x", "done", "1", "✓", "✔"]);

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Lists live in SQLite, or in a Google Sheet once linked (the Sheet is then the source of truth).
 * Both paths expose the same items, so modules and the API do not care which one is in use.
 */
export class Lists {
  private sheetCache = new Map<string, { at: number; items: ListItem[] }>();

  constructor(
    private db: DB,
    private google: Google,
    private onChange: (householdId: string, listId: string) => void = () => {},
  ) {}

  private row(householdId: string, id: string): ListRow {
    const row = this.db.prepare("SELECT * FROM lists WHERE id = ? AND household_id = ?").get(id, householdId) as ListRow | undefined;
    if (!row) throw new HttpError(404, "List not found");
    return row;
  }

  private info(r: ListRow): ListInfo {
    return { id: r.id, name: r.name, kind: r.kind, sheetUrl: r.sheet_url };
  }

  all(householdId: string): ListInfo[] {
    const rows = this.db.prepare("SELECT * FROM lists WHERE household_id = ? ORDER BY created_at").all(householdId) as unknown as ListRow[];
    return rows.map((r) => this.info(r));
  }

  create(householdId: string, input: { name?: string; kind?: string }): ListInfo {
    const kind = (input.kind ?? "custom") as ListInfo["kind"];
    if (!KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${KINDS.join(", ")}`);
    const preset = LIST_PRESETS[kind];
    const id = newId();
    const name = (input.name ?? "").trim() || preset.name;
    tx(this.db, () => {
      this.db.prepare("INSERT INTO lists (id, household_id, name, kind) VALUES (?, ?, ?, ?)").run(id, householdId, name, kind);
      preset.seed.forEach((s, i) =>
        this.db.prepare("INSERT INTO list_items (id, list_id, position, text, label) VALUES (?, ?, ?, ?, ?)").run(newId(), id, i, s.text, s.label),
      );
    });
    return this.info(this.row(householdId, id));
  }

  rename(householdId: string, id: string, name: string): ListInfo {
    this.row(householdId, id);
    this.db.prepare("UPDATE lists SET name = ? WHERE id = ?").run(name.trim(), id);
    this.onChange(householdId, id);
    return this.info(this.row(householdId, id));
  }

  delete(householdId: string, id: string): void {
    this.row(householdId, id);
    this.db.prepare("DELETE FROM lists WHERE id = ?").run(id);
    this.sheetCache.delete(id);
  }

  async get(householdId: string, id: string): Promise<{ list: ListInfo; items: ListItem[] }> {
    const r = this.row(householdId, id);
    return { list: this.info(r), items: await this.items(r) };
  }

  private async items(r: ListRow, fresh = false): Promise<ListItem[]> {
    if (!r.sheet_id) {
      const rows = this.db
        .prepare("SELECT id, text, done, label FROM list_items WHERE list_id = ? ORDER BY position")
        .all(r.id) as unknown as { id: string; text: string; done: number; label: string }[];
      return rows.map((x) => ({ id: x.id, text: x.text, done: x.done === 1, label: x.label }));
    }
    const cached = this.sheetCache.get(r.id);
    if (!fresh && cached && Date.now() - cached.at < SHEET_CACHE_MS) return cached.items;
    const rows = await this.google.readRows(r.household_id, r.sheet_account_id!, r.sheet_id);
    const items = rowsToItems(r.kind, rows.slice(1));
    this.sheetCache.set(r.id, { at: Date.now(), items });
    return items;
  }

  /** Apply a change to the full item list, then persist to SQLite or the Sheet. */
  private async mutate(householdId: string, id: string, fn: (items: ListItem[]) => ListItem[]): Promise<ListItem[]> {
    const r = this.row(householdId, id);
    const next = fn(await this.items(r, true));
    if (r.sheet_id) {
      await this.google.writeRows(householdId, r.sheet_account_id!, r.sheet_id, [LIST_PRESETS[r.kind].sheetHeader, ...itemsToRows(r.kind, next)]);
      // Sheet rows have no stable ids; positions become the ids.
      const reread = next.map((it, i) => ({ ...it, id: `row-${i}` }));
      this.sheetCache.set(r.id, { at: Date.now(), items: reread });
      this.onChange(householdId, id);
      return reread;
    }
    tx(this.db, () => {
      this.db.prepare("DELETE FROM list_items WHERE list_id = ?").run(id);
      next.forEach((it, i) =>
        this.db
          .prepare("INSERT INTO list_items (id, list_id, position, text, done, label) VALUES (?, ?, ?, ?, ?, ?)")
          .run(it.id, id, i, it.text, it.done ? 1 : 0, it.label),
      );
    });
    this.onChange(householdId, id);
    return next;
  }

  addItem(householdId: string, id: string, input: ItemInput): Promise<ListItem[]> {
    const text = (input.text ?? "").trim();
    if (!text) throw new HttpError(400, "text is required");
    return this.mutate(householdId, id, (items) => [...items, { id: newId(), text, done: Boolean(input.done), label: input.label ?? "" }]);
  }

  updateItem(householdId: string, id: string, itemId: string, input: ItemInput): Promise<ListItem[]> {
    return this.mutate(householdId, id, (items) => {
      const i = items.findIndex((x) => x.id === itemId);
      if (i < 0) throw new HttpError(404, "Item not found");
      const copy = [...items];
      copy[i] = {
        ...copy[i],
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.done !== undefined ? { done: Boolean(input.done) } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
      };
      return copy;
    });
  }

  removeItem(householdId: string, id: string, itemId: string): Promise<ListItem[]> {
    return this.mutate(householdId, id, (items) => {
      if (!items.some((x) => x.id === itemId)) throw new HttpError(404, "Item not found");
      return items.filter((x) => x.id !== itemId);
    });
  }

  /** Replace all items (reorder, bulk edit, clear completed). */
  replaceItems(householdId: string, id: string, input: ItemInput[]): Promise<ListItem[]> {
    return this.mutate(householdId, id, () =>
      input.map((it) => ({ id: newId(), text: (it.text ?? "").trim(), done: Boolean(it.done), label: it.label ?? "" })),
    );
  }

  /** Create a Google Sheet holding this list, copy the items in, and share it. */
  async linkSheet(householdId: string, id: string, accountId: string, shareWith: string[]): Promise<ListInfo> {
    const r = this.row(householdId, id);
    if (r.sheet_id) throw new HttpError(409, "List is already linked to a Google Sheet");
    const items = await this.items(r);
    const preset = LIST_PRESETS[r.kind];
    const checkboxCol = preset.sheetHeader.indexOf("Done");
    const sheet = await this.google.createSheet(
      householdId,
      accountId,
      `Home display: ${r.name}`,
      preset.sheetHeader,
      itemsToRows(r.kind, items),
      checkboxCol >= 0 ? checkboxCol : null,
    );
    for (const email of shareWith.map((e) => e.trim()).filter(Boolean)) await this.google.share(householdId, accountId, sheet.id, email);
    this.db
      .prepare("UPDATE lists SET sheet_id = ?, sheet_url = ?, sheet_account_id = ? WHERE id = ?")
      .run(sheet.id, sheet.url, accountId, id);
    this.sheetCache.delete(id);
    this.onChange(householdId, id);
    return this.info(this.row(householdId, id));
  }

  /** Stop using the Sheet: copy its current items back into the app. The Sheet itself is kept. */
  async unlinkSheet(householdId: string, id: string): Promise<ListInfo> {
    const r = this.row(householdId, id);
    if (!r.sheet_id) return this.info(r);
    const items = await this.items(r, true);
    tx(this.db, () => {
      this.db.prepare("UPDATE lists SET sheet_id = NULL, sheet_url = NULL, sheet_account_id = NULL WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM list_items WHERE list_id = ?").run(id);
      items.forEach((it, i) =>
        this.db
          .prepare("INSERT INTO list_items (id, list_id, position, text, done, label) VALUES (?, ?, ?, ?, ?, ?)")
          .run(newId(), id, i, it.text, it.done ? 1 : 0, it.label),
      );
    });
    this.sheetCache.delete(id);
    this.onChange(householdId, id);
    return this.info(this.row(householdId, id));
  }
}

const truthy = (v: string | undefined) => TRUTHY.has((v ?? "").trim().toLowerCase());

/** Sheet columns per list kind: see LIST_PRESETS[kind].sheetHeader. */
export function rowsToItems(kind: ListInfo["kind"], rows: string[][]): ListItem[] {
  const items: ListItem[] = [];
  rows.forEach((row, i) => {
    const id = `row-${i}`;
    if (kind === "meals") {
      if (!(row[0] ?? "").trim() && !(row[1] ?? "").trim()) return;
      items.push({ id, label: (row[0] ?? "").trim(), text: (row[1] ?? "").trim(), done: false });
      return;
    }
    const text = (row[0] ?? "").trim();
    if (!text) return;
    items.push({ id, text, done: truthy(row[1]), label: kind === "todo" ? "" : (row[2] ?? "").trim() });
  });
  return items;
}

export function itemsToRows(kind: ListInfo["kind"], items: ListItem[]): (string | boolean)[][] {
  if (kind === "meals") return items.map((it) => [it.label, it.text]);
  if (kind === "todo") return items.map((it) => [it.text, it.done]);
  return items.map((it) => [it.text, it.done, it.label]);
}
