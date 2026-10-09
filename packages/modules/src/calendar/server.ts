import type { CalendarEvent, CalendarSourceRef, ModuleServer } from "../types.ts";
import { parseIcs } from "./ics.ts";

export function calendarRange(now: Date, view: string, days: number, weekStart: number): { from: Date; to: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (view === "day") return { from: start, to: addDays(start, 1) };
  if (view === "week") {
    const offset = (start.getDay() - weekStart + 7) % 7;
    const from = addDays(start, -offset);
    return { from, to: addDays(from, 7) };
  }
  if (view === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const from = addDays(first, -offset);
    return { from, to: addDays(from, 42) };
  }
  return { from: start, to: addDays(start, Math.max(1, days)) };
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function sortKey(e: CalendarEvent): number {
  // All-day dates are local dates; parse them as local midnight.
  return e.allDay ? new Date(`${e.start}T00:00:00`).getTime() : new Date(e.start).getTime();
}

export const calendarServer: ModuleServer = {
  id: "calendar",
  async load(settings, ctx) {
    const sources = (settings.sources as CalendarSourceRef[] | undefined) ?? [];
    const { from, to } = calendarRange(
      ctx.now(),
      String(settings.view ?? "agenda"),
      Number(settings.days ?? 7),
      Number(settings.weekStart ?? 0),
    );
    const errors: string[] = [];
    const results = await Promise.all(
      sources.map(async (src) => {
        try {
          if (src.type === "google") return await ctx.googleCalendarEvents(src, from, to);
          const url = src.id.replace(/^webcal:/i, "https:");
          const res = await ctx.fetch(url, { headers: { accept: "text/calendar" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return parseIcs(await res.text(), from, to, { id: src.id, color: src.color });
        } catch (err) {
          errors.push(`${src.name}: ${(err as Error).message}`);
          return [];
        }
      }),
    );
    let events = results.flat();
    if (settings.showAllDay === false) events = events.filter((e) => !e.allDay);
    events.sort((a, b) => sortKey(a) - sortKey(b) || Number(b.allDay) - Number(a.allDay));
    return { from: from.toISOString(), to: to.toISOString(), events, errors };
  },
};
