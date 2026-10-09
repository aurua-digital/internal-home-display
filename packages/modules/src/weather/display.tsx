import type { DisplayProps } from "../display-types.ts";
import { formatKey } from "../dates.ts";

// WMO weather codes from Open-Meteo.
export function weatherIcon(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

export function weatherText(code: number): string {
  const t: Record<number, string> = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
  };
  return t[code] ?? "";
}

export function WeatherDisplay({ settings, data }: DisplayProps) {
  if (!data) return <Muted>Loading weather…</Muted>;
  if (data.error) return <Muted>{data.error}</Muted>;
  const deg = (n: number) => `${Math.round(n)}°`;
  const windUnit = data.units === "imperial" ? "mph" : "km/h";
  const show = settings.showCurrent !== false && data.current;
  const hours = settings.showHourly ? (data.hourly ?? []).filter((_: any, i: number) => i % 3 === 0).slice(0, 6) : [];
  const column = settings.layout === "column";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.8em" }}>
      {show && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
          <div style={{ fontSize: "3.4em", lineHeight: 1 }}>{weatherIcon(data.current.code, data.current.isDay)}</div>
          <div>
            <div style={{ fontSize: "3em", fontWeight: 300, lineHeight: 1 }}>{deg(data.current.temp)}</div>
            <div style={{ color: "var(--muted)", fontSize: "0.85em" }}>
              {weatherText(data.current.code)} · feels {deg(data.current.feelsLike)}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", color: "var(--muted)", fontSize: "0.85em" }}>
            {data.today && (
              <div>
                H {deg(data.today.max)} · L {deg(data.today.min)}
              </div>
            )}
            <div>
              {Math.round(data.current.wind)} {windUnit} · {data.current.humidity}%
            </div>
          </div>
        </div>
      )}
      {hours.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8em" }}>
          {hours.map((h: any) => (
            <div key={h.time} style={{ textAlign: "center" }}>
              <div style={{ color: "var(--muted)" }}>{new Date(h.time).toLocaleTimeString("en-US", { hour: "numeric" }).replace(" ", "").toLowerCase()}</div>
              <div style={{ fontSize: "1.5em" }}>{weatherIcon(h.code)}</div>
              <div>{deg(h.temp)}</div>
            </div>
          ))}
        </div>
      )}
      {data.daily.length > 0 && (
        <div style={{ display: "flex", flexDirection: column ? "column" : "row", gap: column ? "0.3em" : "0.4em", flex: 1, justifyContent: "space-between" }}>
          {data.daily.map((d: any) => (
            <div
              key={d.date}
              style={{
                display: "flex",
                flexDirection: column ? "row" : "column",
                alignItems: "center",
                justifyContent: column ? "space-between" : "center",
                gap: "0.2em",
                flex: 1,
                textAlign: "center",
                fontSize: "0.85em",
              }}
            >
              <div style={{ color: "var(--muted)", minWidth: column ? "3em" : undefined, textAlign: "left" }}>{formatKey(d.date, { weekday: "short" })}</div>
              <div style={{ fontSize: "1.8em", lineHeight: 1 }}>{weatherIcon(d.code)}</div>
              <div>
                {deg(d.max)} <span style={{ color: "var(--muted)" }}>{deg(d.min)}</span>
              </div>
              {d.precip >= 30 && <div style={{ color: "var(--accent)", fontSize: "0.8em" }}>{d.precip}%</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ color: "var(--muted)", fontSize: "0.65em", textAlign: "right" }}>{data.location}{data.stale ? " · offline, showing last update" : ""}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--muted)", display: "flex", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{children}</div>;
}
