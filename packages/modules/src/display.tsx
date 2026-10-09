// Display-side module registry (what each module looks like). Imported by the web app only.
import type { ComponentType } from "react";
import type { DisplayProps } from "./display-types.ts";
import { ClockDisplay } from "./clock/display.tsx";
import { CalendarDisplay } from "./calendar/display.tsx";
import { WeatherDisplay } from "./weather/display.tsx";
import { ListDisplay } from "./lists/display.tsx";

export type { DisplayProps } from "./display-types.ts";
export * from "./dates.ts";

export const DISPLAYS: Record<string, ComponentType<DisplayProps>> = {
  clock: ClockDisplay,
  calendar: CalendarDisplay,
  weather: WeatherDisplay,
  list: ListDisplay,
};
