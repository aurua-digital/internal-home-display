import type { Theme } from "./types.ts";

export interface DisplayProps<D = any> {
  settings: Record<string, any>;
  data: D | null;
  theme: Theme;
  now: Date;
  /** Smaller widgets drop detail: cell size of the widget on the 24 x 14 grid. */
  size: { w: number; h: number };
}
