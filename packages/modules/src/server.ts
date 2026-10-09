// Server-side module registry (data loaders). Imported by the API only.
import type { ModuleServer } from "./types.ts";
import { calendarServer } from "./calendar/server.ts";
import { weatherServer } from "./weather/server.ts";
import { listsServer } from "./lists/server.ts";

export { parseIcs } from "./calendar/ics.ts";
export { calendarRange } from "./calendar/server.ts";

export const SERVERS: Record<string, ModuleServer> = Object.fromEntries(
  [calendarServer, weatherServer, listsServer].map((s) => [s.id, s]),
);
