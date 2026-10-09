import type { ModuleServer } from "../types.ts";

export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export const weatherServer: ModuleServer = {
  id: "weather",
  async load(settings, ctx) {
    const loc = settings.location as WeatherLocation | null;
    if (!loc) return { error: "Pick a location in this widget's settings." };
    const units = settings.units === "theme" || !settings.units ? ctx.theme.units : String(settings.units);
    const imperial = units === "imperial";
    const days = Math.min(16, Math.max(1, Number(settings.days ?? 5) + 1));
    const q = new URLSearchParams({
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
      hourly: "temperature_2m,weather_code,precipitation_probability",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
      temperature_unit: imperial ? "fahrenheit" : "celsius",
      wind_speed_unit: imperial ? "mph" : "kmh",
      timezone: "auto",
      forecast_days: String(days),
      forecast_hours: "24",
    });
    const res = await ctx.fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const daily = (body.daily?.time ?? []).map((date: string, i: number) => ({
      date,
      code: body.daily.weather_code[i],
      max: body.daily.temperature_2m_max[i],
      min: body.daily.temperature_2m_min[i],
      precip: body.daily.precipitation_probability_max?.[i] ?? null,
      sunrise: body.daily.sunrise?.[i],
      sunset: body.daily.sunset?.[i],
    }));
    const hourly = (body.hourly?.time ?? []).map((time: string, i: number) => ({
      time,
      temp: body.hourly.temperature_2m[i],
      code: body.hourly.weather_code[i],
      precip: body.hourly.precipitation_probability?.[i] ?? null,
    }));
    return {
      location: loc.name,
      units: imperial ? "imperial" : "metric",
      current: body.current
        ? {
            temp: body.current.temperature_2m,
            feelsLike: body.current.apparent_temperature,
            humidity: body.current.relative_humidity_2m,
            wind: body.current.wind_speed_10m,
            code: body.current.weather_code,
            isDay: body.current.is_day === 1,
          }
        : null,
      today: daily[0] ?? null,
      // Forecast starts tomorrow: today is shown as current conditions.
      daily: daily.slice(1, 1 + Number(settings.days ?? 5)),
      hourly,
    };
  },
};
