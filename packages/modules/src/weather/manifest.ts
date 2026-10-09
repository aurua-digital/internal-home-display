import type { ModuleManifest } from "../types.ts";

export const weatherManifest: ModuleManifest = {
  id: "weather",
  name: "Weather",
  description: "Current conditions and forecast from Open-Meteo (no API key needed)",
  defaultSize: { w: 8, h: 5 },
  refreshSec: 900,
  settings: [
    { key: "location", label: "Location", type: "location", default: null, help: "Search a city or ZIP code" },
    { key: "days", label: "Forecast days", type: "number", default: 5, min: 0, max: 14 },
    { key: "showCurrent", label: "Show current conditions", type: "boolean", default: true },
    { key: "showHourly", label: "Show next hours", type: "boolean", default: false },
    {
      key: "units",
      label: "Units",
      type: "select",
      default: "theme",
      options: [
        { value: "theme", label: "Use theme setting" },
        { value: "imperial", label: "°F, mph" },
        { value: "metric", label: "°C, km/h" },
      ],
    },
    {
      key: "layout",
      label: "Forecast layout",
      type: "select",
      default: "row",
      options: [
        { value: "row", label: "Row" },
        { value: "column", label: "Column" },
      ],
    },
  ],
};
