import type { ModuleManifest } from "../types.ts";

export const calendarManifest: ModuleManifest = {
  id: "calendar",
  name: "Calendar",
  description: "Events from Google calendars and ICS links (Outlook, iCloud and others)",
  defaultSize: { w: 10, h: 8 },
  refreshSec: 300,
  settings: [
    { key: "sources", label: "Calendars", type: "calendars", default: [] },
    {
      key: "view",
      label: "View",
      type: "select",
      default: "agenda",
      options: [
        { value: "agenda", label: "Agenda list" },
        { value: "day", label: "Today" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
      ],
    },
    { key: "days", label: "Days to show (agenda)", type: "number", default: 7, min: 1, max: 31 },
    {
      key: "weekStart",
      label: "Week starts on",
      type: "select",
      default: "0",
      options: [
        { value: "0", label: "Sunday" },
        { value: "1", label: "Monday" },
      ],
    },
    { key: "showAllDay", label: "Show all-day events", type: "boolean", default: true },
    { key: "showLocation", label: "Show location", type: "boolean", default: false },
    { key: "maxEvents", label: "Max events (agenda)", type: "number", default: 30, min: 1, max: 200 },
  ],
};
