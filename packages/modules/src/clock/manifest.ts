import type { ModuleManifest } from "../types.ts";

export const clockManifest: ModuleManifest = {
  id: "clock",
  name: "Clock",
  description: "Time and date",
  defaultSize: { w: 8, h: 3 },
  refreshSec: 0,
  settings: [
    { key: "showSeconds", label: "Show seconds", type: "boolean", default: false },
    { key: "showDate", label: "Show date", type: "boolean", default: true },
    {
      key: "dateStyle",
      label: "Date style",
      type: "select",
      default: "full",
      options: [
        { value: "full", label: "Friday, October 9" },
        { value: "short", label: "Fri, Oct 9" },
      ],
    },
  ],
};
