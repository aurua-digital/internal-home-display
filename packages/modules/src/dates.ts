// Date helpers that respect the theme's time zone ("" = this device's zone).

export function tzOf(tz: string): string | undefined {
  return tz || undefined;
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tzOf(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Weekday 0 (Sunday) to 6 for a YYYY-MM-DD key. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatTime(d: Date, tz: string, format: "12h" | "24h"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tzOf(tz),
    hour: format === "12h" ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12: format === "12h",
  })
    .format(d)
    .replace(" AM", "a")
    .replace(" PM", "p");
}

export function formatKey(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "HH:MM" window check used by the show-from / show-until widget options. */
export function inWindow(from: string, until: string, nowMinutes: number): boolean {
  const parse = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = parse(from);
  const b = parse(until);
  if (a === null && b === null) return true;
  if (a !== null && b !== null) return a <= b ? nowMinutes >= a && nowMinutes < b : nowMinutes >= a || nowMinutes < b;
  if (a !== null) return nowMinutes >= a;
  return nowMinutes < b!;
}

export function minutesOfDay(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tzOf(tz), hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  return h * 60 + Number(parts.find((p) => p.type === "minute")!.value);
}
