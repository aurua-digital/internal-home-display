// Module registry shared by the API and the web app. Register new modules here,
// in server.ts and in display.tsx.
import type { ModuleManifest } from "./types.ts";
import { clockManifest } from "./clock/manifest.ts";
import { calendarManifest } from "./calendar/manifest.ts";
import { weatherManifest } from "./weather/manifest.ts";
import { listsManifest } from "./lists/manifest.ts";

export * from "./types.ts";
export * from "./lists/presets.ts";

export const MANIFESTS: ModuleManifest[] = [clockManifest, calendarManifest, weatherManifest, listsManifest];

export function getManifest(id: string): ModuleManifest | undefined {
  return MANIFESTS.find((m) => m.id === id);
}
