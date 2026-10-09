// Shared contracts between the core (API + web) and every module.
// A module is a folder under src/ with:
//   manifest.ts  - what the module is and which settings it has (shared)
//   server.ts    - how it loads its data on the server (never in the TV browser)
//   display.tsx  - how it draws on the display
// and one line in each of index.ts, server.ts and display.tsx.

export type SettingType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "list" // pick one of the household's lists
  | "calendars" // pick calendar sources (Google calendars and ICS URLs)
  | "location"; // place name resolved to lat/lon

export interface SettingField {
  key: string;
  label: string;
  type: SettingType;
  default?: unknown;
  help?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  /** Default size on the 24 x 14 display grid. */
  defaultSize: { w: number; h: number };
  /** Seconds between data refreshes on the display. 0 = no server data. */
  refreshSec: number;
  settings: SettingField[];
}

/** Settings every widget has, whatever its module (MOD-3). */
export interface CommonSettings {
  title: string;
  showTitle: boolean;
  fontScale: number;
  textColor: string; // "" = theme default
  background: string; // "" = theme card colour
  /** Only show the widget between these times (HH:MM, local). Empty = always. */
  showFrom: string;
  showUntil: string;
}

export const COMMON_SETTINGS: SettingField[] = [
  { key: "title", label: "Title", type: "text", default: "" },
  { key: "showTitle", label: "Show title", type: "boolean", default: true },
  { key: "fontScale", label: "Text size", type: "number", default: 1, min: 0.5, max: 3, help: "1 = normal" },
  { key: "textColor", label: "Text colour", type: "color", default: "" },
  { key: "background", label: "Card background", type: "color", default: "" },
  { key: "showFrom", label: "Show from (HH:MM)", type: "text", default: "" },
  { key: "showUntil", label: "Show until (HH:MM)", type: "text", default: "" },
];

export interface Widget {
  /** Unique within the layout. */
  id: string;
  module: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings: Record<string, unknown>;
}

export interface Theme {
  background: string;
  backgroundImage: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  cardColor: string;
  cardOpacity: number;
  fontFamily: string;
  baseFontSize: number;
  timeFormat: "12h" | "24h";
  units: "imperial" | "metric";
  timezone: string; // "" = device time zone
}

export const DEFAULT_THEME: Theme = {
  background: "#0f172a",
  backgroundImage: "",
  textColor: "#f8fafc",
  mutedColor: "#94a3b8",
  accentColor: "#38bdf8",
  cardColor: "#1e293b",
  cardOpacity: 0.7,
  fontFamily: "Inter, system-ui, sans-serif",
  baseFontSize: 22,
  timeFormat: "12h",
  units: "imperial",
  timezone: "",
};

export const GRID = { cols: 24, rows: 14, width: 1920, height: 1080 } as const;

/** Resolve a widget's settings: manifest defaults, then common defaults, then saved values. */
export function resolveSettings(manifest: ModuleManifest, saved: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of [...COMMON_SETTINGS, ...manifest.settings]) out[f.key] = f.default;
  out.title = manifest.name;
  return { ...out, ...saved };
}

// ----- Server-side context handed to module data loaders -----

export interface ListItem {
  id: string;
  text: string;
  done: boolean;
  label: string; // day for meal plans, category for shopping
}

export interface ListInfo {
  id: string;
  name: string;
  kind: "todo" | "shopping" | "meals" | "custom";
  sheetUrl: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location?: string;
  color: string;
  source: string;
}

export interface CalendarSourceRef {
  /** "ics" or "google" */
  type: "ics" | "google";
  /** ICS URL, or Google calendar id */
  id: string;
  /** Google account id the calendar belongs to */
  accountId?: string;
  name: string;
  color: string;
}

export interface ModuleContext {
  householdId: string;
  theme: Theme;
  fetch: typeof fetch;
  now: () => Date;
  getList(listId: string): Promise<{ list: ListInfo; items: ListItem[] } | null>;
  googleCalendarEvents(src: CalendarSourceRef, from: Date, to: Date): Promise<CalendarEvent[]>;
}

export interface ModuleServer {
  id: string;
  load(settings: Record<string, unknown>, ctx: ModuleContext): Promise<unknown>;
}
