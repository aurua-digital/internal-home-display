import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DISPLAYS, inWindow, minutesOfDay } from "@hd/modules/display";
import { GRID, MANIFESTS, getManifest, resolveSettings, type Theme, type Widget } from "@hd/modules";

export const GAP = 8;
export const ROW_H = (GRID.height - (GRID.rows - 1) * GAP) / GRID.rows;

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Poll a loader. Keeps the last good value if a refresh fails (the TV must never go blank). */
export function useData<T>(load: () => Promise<T>, refreshSec: number, deps: unknown[], debounceMs = 0): T | null {
  const [data, setData] = useState<T | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const v = await loadRef.current();
        if (!cancelled) setData(v);
      } catch {
        /* keep previous data */
      }
      if (!cancelled && refreshSec > 0) timer = setTimeout(run, refreshSec * 1000);
    };
    timer = setTimeout(run, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function themeVars(theme: Theme): CSSProperties {
  return {
    "--text": theme.textColor,
    "--muted": theme.mutedColor,
    "--accent": theme.accentColor,
    "--card": theme.cardColor,
  } as CSSProperties;
}

export function canvasStyle(theme: Theme): CSSProperties {
  return {
    ...themeVars(theme),
    width: GRID.width,
    height: GRID.height,
    background: theme.backgroundImage ? `center / cover url(${JSON.stringify(theme.backgroundImage)}), ${theme.background}` : theme.background,
    color: "var(--text)",
    fontFamily: theme.fontFamily,
    fontSize: theme.baseFontSize,
    position: "relative",
    overflow: "hidden",
  };
}

/** One widget: card frame, title and the module's own drawing. */
export function WidgetView({
  widget,
  theme,
  now,
  loadData,
  debounceMs = 0,
  dimWhenHidden = false,
}: {
  widget: Widget;
  theme: Theme;
  now: Date;
  loadData: (widget: Widget) => Promise<{ data: unknown }>;
  debounceMs?: number;
  dimWhenHidden?: boolean;
}) {
  const manifest = getManifest(widget.module);
  const settings = manifest ? resolveSettings(manifest, widget.settings) : {};
  const settingsKey = JSON.stringify(widget.settings) + theme.units;
  const data = useData(async () => (await loadData(widget)).data, manifest?.refreshSec ?? 0, [widget.id, widget.module, settingsKey], debounceMs);
  const Body = DISPLAYS[widget.module];
  const visible = inWindow(String(settings.showFrom ?? ""), String(settings.showUntil ?? ""), minutesOfDay(now, theme.timezone));
  if (!visible && !dimWhenHidden) return null;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: settings.background
          ? String(settings.background)
          : `color-mix(in srgb, ${theme.cardColor} ${Math.round(theme.cardOpacity * 100)}%, transparent)`,
        color: settings.textColor ? String(settings.textColor) : undefined,
        fontSize: `${Number(settings.fontScale) || 1}em`,
        opacity: visible ? 1 : 0.35,
        ...(settings.textColor ? ({ "--text": settings.textColor } as CSSProperties) : {}),
      }}
    >
      {settings.showTitle !== false && Boolean(settings.title) && (
        <div style={{ color: "var(--muted)", fontSize: "0.7em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5em" }}>
          {String(settings.title)}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {Body ? <Body settings={settings} data={data as any} theme={theme} now={now} size={{ w: widget.w, h: widget.h }} /> : <span>Unknown module</span>}
      </div>
    </div>
  );
}

/** Lays widgets on the 24 x 14 grid. Same geometry as the designer's react-grid-layout. */
export function StaticGrid({ widgets, render }: { widgets: Widget[]; render: (w: Widget) => ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`,
        gridTemplateRows: `repeat(${GRID.rows}, 1fr)`,
        gap: GAP,
      }}
    >
      {widgets.map((w) => (
        <div key={w.id} style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}`, minWidth: 0, minHeight: 0 }}>
          {render(w)}
        </div>
      ))}
    </div>
  );
}

/** Scales the fixed 1920 x 1080 canvas to fit its container. */
export function Fit({ children, cover = false }: { children: (scale: number) => ReactNode; cover?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current!;
    const update = () => {
      const sx = el.clientWidth / GRID.width;
      const sy = el.clientHeight / GRID.height;
      setScale(cover ? Math.min(sx, sy) : sx);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cover]);
  return (
    <div ref={ref} style={{ width: "100%", height: cover ? "100%" : undefined, aspectRatio: cover ? undefined : "16 / 9", position: "relative", overflow: "hidden" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: GRID.width, height: GRID.height, position: "absolute", left: cover ? (ref.current ? (ref.current.clientWidth - GRID.width * scale) / 2 : 0) : 0, top: cover ? (ref.current ? (ref.current.clientHeight - GRID.height * scale) / 2 : 0) : 0 }}>
        {children(scale)}
      </div>
    </div>
  );
}

export { MANIFESTS };
