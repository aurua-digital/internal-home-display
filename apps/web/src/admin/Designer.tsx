import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { COMMON_SETTINGS, DEFAULT_THEME, GRID, MANIFESTS, getManifest, resolveSettings, type SettingField, type Theme, type Widget } from "@hd/modules";
import { api, type DisplayDoc } from "../api";
import { Fit, GAP, ROW_H, WidgetView, canvasStyle, useNow } from "../canvas";
import { SettingsForm } from "./SettingsForm";
import { useAction, useToast } from "./ui";

const THEME_FIELDS: SettingField[] = [
  { key: "background", label: "Background colour", type: "color" },
  { key: "backgroundImage", label: "Background photo URL", type: "text", help: "Optional. Leave empty for a plain colour." },
  { key: "textColor", label: "Text colour", type: "color" },
  { key: "mutedColor", label: "Secondary text colour", type: "color" },
  { key: "accentColor", label: "Accent colour", type: "color" },
  { key: "cardColor", label: "Card colour", type: "color" },
  { key: "cardOpacity", label: "Card opacity (0 to 1)", type: "number", min: 0, max: 1 },
  { key: "baseFontSize", label: "Base text size (px on 1080p)", type: "number", min: 12, max: 48 },
  { key: "fontFamily", label: "Font", type: "select", options: [
    { value: "Inter, system-ui, sans-serif", label: "Modern sans" },
    { value: "Georgia, 'Times New Roman', serif", label: "Serif" },
    { value: "ui-rounded, 'Nunito', system-ui, sans-serif", label: "Rounded" },
    { value: "ui-monospace, Menlo, Consolas, monospace", label: "Monospace" },
  ] },
  { key: "timeFormat", label: "Clock", type: "select", options: [{ value: "12h", label: "12 hour" }, { value: "24h", label: "24 hour" }] },
  { key: "units", label: "Units", type: "select", options: [{ value: "imperial", label: "°F, mph" }, { value: "metric", label: "°C, km/h" }] },
  { key: "timezone", label: "Time zone", type: "text", help: "e.g. America/Chicago. Empty = the Pi's time zone." },
];

/** First free rectangle on the grid for a new widget. */
function findSpot(widgets: Widget[], w: number, h: number): { x: number; y: number } {
  const taken = (x: number, y: number) => widgets.some((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
  for (let y = 0; y + h <= GRID.rows; y++) for (let x = 0; x + w <= GRID.cols; x++) if (!taken(x, y)) return { x, y };
  return { x: 0, y: 0 };
}

export default function Designer() {
  const run = useAction();
  const toast = useToast();
  const [displays, setDisplays] = useState<DisplayDoc[]>([]);
  const [id, setId] = useState("");
  const [saved, setSaved] = useState<DisplayDoc | null>(null);
  const [layout, setLayout] = useState<Widget[]>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [name, setName] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"widget" | "add" | "theme">("add");
  const now = useNow(1000);

  const open = useCallback((d: DisplayDoc) => {
    setSaved(d);
    setLayout(d.layout);
    setTheme({ ...DEFAULT_THEME, ...d.theme });
    setName(d.name);
    setSel(null);
    setTab("add");
  }, []);

  const loadAll = useCallback(
    async (keep?: string) => {
      const all = await api<DisplayDoc[]>("GET", "/api/displays");
      setDisplays(all);
      const pick = all.find((d) => d.id === keep) ?? all[0];
      if (pick) {
        setId(pick.id);
        open(pick);
      }
    },
    [open],
  );
  useEffect(() => {
    run(() => loadAll());
  }, [loadAll, run]);

  const dirty = useMemo(
    () => !!saved && (JSON.stringify(layout) !== JSON.stringify(saved.layout) || JSON.stringify(theme) !== JSON.stringify({ ...DEFAULT_THEME, ...saved.theme }) || name !== saved.name),
    [layout, theme, name, saved],
  );

  const save = useCallback(async () => {
    const d = await run(() => api<DisplayDoc>("PUT", `/api/displays/${id}`, { name, layout, theme }), "Published to the display");
    if (d) {
      setSaved(d);
      setLayout(d.layout);
      setDisplays((all) => all.map((x) => (x.id === d.id ? d : x)));
    }
  }, [id, name, layout, theme, run]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);

  const selected = layout.find((w) => w.id === sel);
  const selManifest = selected && getManifest(selected.module);
  const patch = (wid: string, p: Partial<Widget>) => setLayout((l) => l.map((w) => (w.id === wid ? { ...w, ...p } : w)));
  const displayUrl = saved ? `${location.origin}/d/${saved.token}` : "";

  const addWidget = (moduleId: string) => {
    const m = getManifest(moduleId)!;
    const spot = findSpot(layout, m.defaultSize.w, m.defaultSize.h);
    const w: Widget = { id: crypto.randomUUID(), module: moduleId, ...spot, ...m.defaultSize, settings: {} };
    setLayout([...layout, w]);
    setSel(w.id);
    setTab("widget");
  };

  const loadPreview = useCallback((w: Widget) => api<{ data: unknown }>("POST", "/api/preview/data", { module: w.module, settings: w.settings, theme }), [theme]);

  if (!saved) return <div className="page muted">Loading…</div>;

  return (
    <div className="page wide">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <select style={{ width: 220 }} value={id} onChange={(e) => loadAll(e.target.value)}>
          {displays.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <input style={{ width: 220 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
        <button onClick={() => run(async () => { const d = await api<DisplayDoc>("POST", "/api/displays", { name: "New display" }); await loadAll(d.id); })}>＋ New display</button>
        <div className="grow" />
        {saved.connected ? <span className="ok small">● {saved.connected} screen{saved.connected > 1 ? "s" : ""} connected</span> : <span className="muted small">○ No screen connected</span>}
        <button className="primary" disabled={!dirty} onClick={save}>{dirty ? "Publish changes" : "Published"}</button>
      </div>

      <div className="designer">
        <div>
          <div className="preview">
            <Fit>
              {(scale) => (
                <div
                  style={canvasStyle(theme)}
                  onMouseDown={(e) => {
                    // Empty canvas (not a widget) deselects.
                    const t = e.target as HTMLElement;
                    if (e.target === e.currentTarget || t.classList.contains("react-grid-layout")) setSel(null);
                  }}
                >
                  <GridLayout
                    layout={layout.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 2 }))}
                    cols={GRID.cols}
                    maxRows={GRID.rows}
                    rowHeight={ROW_H}
                    width={GRID.width}
                    margin={[GAP, GAP]}
                    containerPadding={[0, 0]}
                    compactType={null}
                    preventCollision
                    isBounded
                    transformScale={scale}
                    onLayoutChange={(next) =>
                      setLayout((cur) => {
                        let changed = false;
                        const out = cur.map((w) => {
                          const n = next.find((l) => l.i === w.id);
                          if (!n || (n.x === w.x && n.y === w.y && n.w === w.w && n.h === w.h)) return w;
                          changed = true;
                          return { ...w, x: n.x, y: n.y, w: n.w, h: n.h };
                        });
                        return changed ? out : cur;
                      })
                    }
                  >
                    {layout.map((w) => (
                      <div key={w.id}>
                        <div className="item-wrap">
                          <WidgetView widget={w} theme={theme} now={now} loadData={loadPreview} debounceMs={350} dimWhenHidden />
                          <div
                            className={`overlay${w.id === sel ? " sel-ring" : ""}`}
                            onMouseDown={() => {
                              setSel(w.id);
                              setTab("widget");
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </GridLayout>
                </div>
              )}
            </Fit>
          </div>
          <p className="small muted">Live preview at 1080p. Drag widgets to move them and pull the corner to resize. Changes appear on the TV when you publish.</p>
          <div className="card">
            <h2>Address for the Raspberry Pi</h2>
            <div className="row">
              <input readOnly value={displayUrl} onFocus={(e) => e.target.select()} />
              <button onClick={() => navigator.clipboard?.writeText(displayUrl).then(() => toast("Copied"))}>Copy</button>
              <a className="btn" href={displayUrl} target="_blank" rel="noreferrer">Open</a>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Anyone with this link can see the display, so keep it private.{" "}
              <button className="ghost danger" onClick={() => confirm("The old link stops working immediately. Update the Pi with the new one. Continue?") && run(async () => { const d = await api<DisplayDoc>("POST", `/api/displays/${id}/token`); setSaved(d); setDisplays((all) => all.map((x) => (x.id === d.id ? d : x))); }, "New link created")}>Make a new link</button>
              {location.hostname === "localhost" && " The Pi needs this address with the hostname or IP of this computer instead of localhost."}
            </p>
          </div>
        </div>

        <div className="card side">
          <div className="tabs">
            <button className={tab === "add" ? "on" : ""} onClick={() => setTab("add")}>Add</button>
            <button className={tab === "widget" ? "on" : ""} onClick={() => setTab("widget")} disabled={!selected}>Widget</button>
            <button className={tab === "theme" ? "on" : ""} onClick={() => setTab("theme")}>Look</button>
          </div>

          {tab === "add" && (
            <>
              {MANIFESTS.map((m) => (
                <div key={m.id} className="row" style={{ marginBottom: 10 }}>
                  <div className="grow">
                    <strong>{m.name}</strong>
                    <div className="small muted">{m.description}</div>
                  </div>
                  <button onClick={() => addWidget(m.id)}>Add</button>
                </div>
              ))}
            </>
          )}

          {tab === "widget" && selected && selManifest && (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <strong className="grow">{selManifest.name}</strong>
                <button onClick={() => { const c = { ...selected, id: crypto.randomUUID(), ...findSpot(layout, selected.w, selected.h) }; setLayout([...layout, c]); setSel(c.id); }}>Duplicate</button>
                <button className="danger" onClick={() => { setLayout(layout.filter((w) => w.id !== selected.id)); setSel(null); setTab("add"); }}>Delete</button>
              </div>
              <h3>{selManifest.name} options</h3>
              <SettingsForm
                fields={selManifest.settings}
                values={resolveSettings(selManifest, selected.settings)}
                onChange={(k, v) => patch(selected.id, { settings: { ...selected.settings, [k]: v } })}
              />
              <h3>Appearance</h3>
              <SettingsForm
                fields={COMMON_SETTINGS}
                values={resolveSettings(selManifest, selected.settings)}
                onChange={(k, v) => patch(selected.id, { settings: { ...selected.settings, [k]: v } })}
              />
            </>
          )}

          {tab === "theme" && <SettingsForm fields={THEME_FIELDS} values={theme as any} onChange={(k, v) => setTheme({ ...theme, [k]: v === undefined ? (DEFAULT_THEME as any)[k] : v })} />}
        </div>
      </div>
    </div>
  );
}


