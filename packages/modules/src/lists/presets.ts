import type { ListInfo } from "../types.ts";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface ListPreset {
  kind: ListInfo["kind"];
  name: string;
  /** Header row of the linked Google Sheet. Column A = text, B = done, C = label unless noted. */
  sheetHeader: string[];
  /** Rows a new list (and its sheet) starts with, as [label, text]. */
  seed: { label: string; text: string }[];
}

export const LIST_PRESETS: Record<ListInfo["kind"], ListPreset> = {
  todo: { kind: "todo", name: "To-do", sheetHeader: ["Task", "Done"], seed: [] },
  shopping: { kind: "shopping", name: "Shopping", sheetHeader: ["Item", "Done", "Category"], seed: [] },
  meals: {
    kind: "meals",
    name: "Weekly meals",
    sheetHeader: ["Day", "Meal"],
    seed: WEEKDAYS.map((d) => ({ label: d, text: "" })),
  },
  custom: { kind: "custom", name: "List", sheetHeader: ["Item", "Done", "Notes"], seed: [] },
};
