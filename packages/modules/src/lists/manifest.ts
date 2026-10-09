import type { ModuleManifest } from "../types.ts";

export const listsManifest: ModuleManifest = {
  id: "list",
  name: "List",
  description: "To-do, shopping, weekly meals or any custom list. Can be edited in Google Sheets.",
  defaultSize: { w: 6, h: 7 },
  refreshSec: 60,
  settings: [
    { key: "listId", label: "List", type: "list", default: "" },
    { key: "hideDone", label: "Hide completed items", type: "boolean", default: false },
    {
      key: "style",
      label: "Style",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Automatic (by list type)" },
        { value: "checklist", label: "Checklist" },
        { value: "bullets", label: "Bullets" },
        { value: "table", label: "Label and text (meal plan)" },
      ],
    },
    { key: "highlightToday", label: "Highlight today (meal plan)", type: "boolean", default: true },
    { key: "columns", label: "Columns", type: "number", default: 1, min: 1, max: 4 },
  ],
};
