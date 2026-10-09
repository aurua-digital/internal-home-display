import type { DisplayProps } from "../display-types.ts";
import { formatKey, dayKey, tzOf } from "../dates.ts";

export function ClockDisplay({ settings, theme, now }: DisplayProps) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tzOf(theme.timezone),
    hour: theme.timeFormat === "12h" ? "numeric" : "2-digit",
    minute: "2-digit",
    second: settings.showSeconds ? "2-digit" : undefined,
    hour12: theme.timeFormat === "12h",
  }).format(now);
  const [clock, ampm] = theme.timeFormat === "12h" ? [time.replace(/\s?[AP]M$/, ""), time.match(/[AP]M$/)?.[0] ?? ""] : [time, ""];
  const date = formatKey(
    dayKey(now, theme.timezone),
    settings.dateStyle === "short"
      ? { weekday: "short", month: "short", day: "numeric" }
      : { weekday: "long", month: "long", day: "numeric" },
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div style={{ fontSize: "4.2em", fontWeight: 300, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {clock}
        {ampm && <span style={{ fontSize: "0.35em", marginLeft: "0.2em", color: "var(--muted)" }}>{ampm}</span>}
      </div>
      {settings.showDate && <div style={{ fontSize: "1.3em", color: "var(--muted)", marginTop: "0.3em" }}>{date}</div>}
    </div>
  );
}
