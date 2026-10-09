import ICAL from "ical.js";
import type { CalendarEvent } from "../types.ts";

const MAX_OCCURRENCES = 2000;

function toOut(t: ICAL.Time): string {
  if (t.isDate) {
    const m = String(t.month).padStart(2, "0");
    const d = String(t.day).padStart(2, "0");
    return `${t.year}-${m}-${d}`;
  }
  return t.toJSDate().toISOString();
}

/**
 * Parse an iCalendar document and return events overlapping [from, to),
 * with recurring events expanded and per-instance exceptions applied.
 */
export function parseIcs(text: string, from: Date, to: Date, source: { id: string; color: string }): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // A malformed VTIMEZONE should not hide the whole calendar.
    }
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(vevent);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const out: CalendarEvent[] = [];

  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, key: string) => {
    const s = start.toJSDate().getTime();
    const e = (end ?? start).toJSDate().getTime();
    if (e <= fromMs && !(e === s && s >= fromMs)) return;
    if (s >= toMs) return;
    if ((ev.component.getFirstPropertyValue("status") as string | null)?.toUpperCase() === "CANCELLED") return;
    out.push({
      id: `${source.id}:${key}`,
      title: ev.summary || "(no title)",
      start: toOut(start),
      end: toOut(end ?? start),
      allDay: start.isDate,
      location: ev.location || undefined,
      color: source.color,
      source: source.id,
    });
  };

  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate, ev.uid);
      continue;
    }
    const it = ev.iterator();
    let next: ICAL.Time | null;
    let n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
      if (next.toJSDate().getTime() >= toMs) break;
      const occ = ev.getOccurrenceDetails(next);
      push(occ.item, occ.startDate, occ.endDate, `${ev.uid}@${next.toString()}`);
    }
  }

  return out;
}
