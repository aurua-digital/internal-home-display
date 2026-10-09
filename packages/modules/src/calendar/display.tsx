import type { CalendarEvent } from "../types.ts";
import type { DisplayProps } from "../display-types.ts";
import { addDaysKey, dayKey, formatKey, formatTime, weekdayOfKey } from "../dates.ts";

interface Data {
  events: CalendarEvent[];
  errors: string[];
  stale?: boolean;
}

interface DayEvent extends CalendarEvent {
  /** Text shown before the title: "9:30a" or "" for all-day / continuing events. */
  when: string;
  sortMs: number;
}

/** Group events by local day, splitting multi-day events across the days they cover. */
export function eventsByDay(events: CalendarEvent[], tz: string, timeFormat: "12h" | "24h"): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  const add = (key: string, e: DayEvent) => map.set(key, [...(map.get(key) ?? []), e]);
  for (const e of events) {
    if (e.allDay) {
      const last = addDaysKey(e.end, -1);
      for (let k = e.start, n = 0; k <= (last < e.start ? e.start : last) && n < 62; k = addDaysKey(k, 1), n++)
        add(k, { ...e, when: "", sortMs: -1 });
    } else {
      const s = new Date(e.start);
      const en = new Date(e.end);
      const first = dayKey(s, tz);
      // An event ending exactly at midnight does not spill into the next day.
      const last = dayKey(new Date(Math.max(s.getTime(), en.getTime() - 1)), tz);
      for (let k = first, n = 0; k <= last && n < 62; k = addDaysKey(k, 1), n++)
        add(k, { ...e, when: k === first ? formatTime(s, tz, timeFormat) : "", sortMs: k === first ? s.getTime() : -1 });
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.sortMs - b.sortMs || a.title.localeCompare(b.title));
  return map;
}

export function CalendarDisplay({ settings, data, theme, now, size }: DisplayProps<Data>) {
  if (!data) return <Muted>Loading calendar…</Muted>;
  if ((settings.sources ?? []).length === 0) return <Muted>Add a calendar in this widget's settings</Muted>;
  const today = dayKey(now, theme.timezone);
  const byDay = eventsByDay(data.events ?? [], theme.timezone, theme.timeFormat);
  const weekStart = Number(settings.weekStart ?? 0);
  const view = settings.view ?? "agenda";
  const errors = data.errors?.length ? <div style={{ color: "#f87171", fontSize: "0.65em" }}>{data.errors.join(" · ")}</div> : null;
  const stale = data.stale ? <div style={{ color: "var(--muted)", fontSize: "0.65em", textAlign: "right" }}>offline, showing last update</div> : null;

  if (view === "week" || view === "month") {
    const weeks = view === "week" ? 1 : 6;
    const first = addDaysKey(today, -((weekdayOfKey(today) - weekStart + 7) % 7));
    const monthFirst = `${today.slice(0, 7)}-01`;
    const gridStart = view === "week" ? first : addDaysKey(monthFirst, -((weekdayOfKey(monthFirst) - weekStart + 7) % 7));
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDaysKey(gridStart, i));
    // How many event lines fit in a day cell (widget px height / rows, minus the day number).
    const fs = theme.baseFontSize * (Number(settings.fontScale) || 1);
    const cellPx = (size.h * 80 - 40 - fs * 1.2) / weeks;
    const capacity = Math.max(1, Math.floor((cellPx - fs * 0.9) / (fs * 0.87)));
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.3em" }}>
        {errors}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `auto repeat(${weeks}, 1fr)`, gap: "0.25em", flex: 1, minHeight: 0 }}>
          {cells.slice(0, 7).map((k) => (
            <div key={`h${k}`} style={{ color: "var(--muted)", textAlign: "center", fontSize: "0.75em" }}>
              {formatKey(k, { weekday: "short" })}
            </div>
          ))}
          {cells.map((k) => {
            const evs = byDay.get(k) ?? [];
            const dim = view === "month" && k.slice(0, 7) !== today.slice(0, 7);
            return (
              <div
                key={k}
                style={{
                  background: k === today ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "color-mix(in srgb, var(--text) 5%, transparent)",
                  borderRadius: "0.4em",
                  padding: "0.25em 0.35em",
                  overflow: "hidden",
                  opacity: dim ? 0.45 : 1,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: "0.75em", fontWeight: k === today ? 700 : 400, color: k === today ? "var(--accent)" : "var(--muted)" }}>{Number(k.slice(8))}</div>
                {evs.slice(0, evs.length > capacity ? Math.max(1, capacity - 1) : capacity).map((e) => (
                  <div key={e.id + k} style={{ fontSize: "0.62em", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderLeft: `0.25em solid ${e.color}`, paddingLeft: "0.3em", marginTop: "0.15em" }}>
                    {e.when && <span style={{ color: "var(--muted)" }}>{e.when} </span>}
                    {e.title}
                  </div>
                ))}
                {evs.length > capacity && <div style={{ fontSize: "0.6em", color: "var(--muted)" }}>+{evs.length - Math.max(1, capacity - 1)} more</div>}
              </div>
            );
          })}
        </div>
        {stale}
      </div>
    );
  }

  // agenda and day
  const days = view === "day" ? 1 : Math.max(1, Number(settings.days) || 7);
  let remaining = Math.max(1, Number(settings.maxEvents) || 30);
  const sections: React.ReactNode[] = [];
  for (let i = 0; i < days && remaining > 0; i++) {
    const k = addDaysKey(today, i);
    const evs = (byDay.get(k) ?? []).slice(0, remaining);
    if (evs.length === 0 && i > 0) continue;
    remaining -= evs.length;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatKey(k, { weekday: "long" });
    sections.push(
      <div key={k} style={{ marginBottom: "0.8em" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: i === 0 ? "var(--accent)" : "var(--muted)", fontSize: "0.8em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid color-mix(in srgb, var(--text) 15%, transparent)", paddingBottom: "0.15em", marginBottom: "0.3em" }}>
          <span>{label}</span>
          <span>{formatKey(k, { month: "short", day: "numeric" })}</span>
        </div>
        {evs.length === 0 && <div style={{ color: "var(--muted)", fontSize: "0.85em" }}>Nothing planned</div>}
        {evs.map((e) => (
          <div key={e.id + k} style={{ display: "flex", gap: "0.6em", padding: "0.18em 0", alignItems: "baseline" }}>
            <span style={{ width: "0.35em", alignSelf: "stretch", background: e.color, borderRadius: "0.2em", flexShrink: 0 }} />
            <span style={{ width: "3.6em", color: "var(--muted)", fontSize: "0.85em", flexShrink: 0 }}>{e.when || (e.allDay ? "all day" : "")}</span>
            <span style={{ minWidth: 0 }}>
              {e.title}
              {settings.showLocation && e.location && <span style={{ color: "var(--muted)", fontSize: "0.8em" }}> · {e.location}</span>}
            </span>
          </div>
        ))}
      </div>,
    );
  }
  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      {errors}
      {sections}
      {stale}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--muted)", display: "flex", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{children}</div>;
}
