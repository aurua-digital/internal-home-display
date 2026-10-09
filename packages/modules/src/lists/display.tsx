import type { DisplayProps } from "../display-types.ts";
import { dayKey, formatKey } from "../dates.ts";

export function ListDisplay({ settings, data, theme, now }: DisplayProps) {
  if (!data) return <Muted>Loading…</Muted>;
  if (data.error) return <Muted>{data.error}</Muted>;
  const kind: string = data.list.kind;
  let items = data.items as { id: string; text: string; done: boolean; label: string }[];
  if (settings.hideDone) items = items.filter((i) => !i.done);
  const style = settings.style === "auto" || !settings.style ? (kind === "meals" ? "table" : kind === "custom" ? "bullets" : "checklist") : settings.style;
  const today = formatKey(dayKey(now, theme.timezone), { weekday: "long" });
  const columns = Math.max(1, Math.min(4, Number(settings.columns) || 1));

  if (items.length === 0) return <Muted>Nothing here yet</Muted>;

  if (style === "table") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-around" }}>
        {items.map((i) => {
          const isToday = settings.highlightToday !== false && i.label.toLowerCase() === today.toLowerCase();
          return (
            <div
              key={i.id}
              style={{
                display: "flex",
                gap: "0.8em",
                padding: "0.25em 0.5em",
                borderRadius: "0.4em",
                background: isToday ? "color-mix(in srgb, var(--accent) 22%, transparent)" : undefined,
                fontWeight: isToday ? 600 : 400,
              }}
            >
              <div style={{ width: "4.5em", color: isToday ? "var(--text)" : "var(--muted)", flexShrink: 0 }}>{i.label.slice(0, 3)}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: i.text ? undefined : "var(--muted)" }}>{i.text || "–"}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ columnCount: columns, columnGap: "1em" }}>
      {items.map((i) => (
        <div key={i.id} style={{ display: "flex", gap: "0.6em", padding: "0.2em 0", breakInside: "avoid", opacity: i.done ? 0.5 : 1 }}>
          <span style={{ color: "var(--accent)", width: "1.2em", flexShrink: 0 }}>{style === "bullets" ? "•" : i.done ? "☑" : "☐"}</span>
          <span style={{ textDecoration: i.done ? "line-through" : undefined }}>
            {i.text}
            {i.label && <span style={{ color: "var(--muted)", fontSize: "0.8em" }}> · {i.label}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--muted)", display: "flex", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{children}</div>;
}
