import { describe, expect, it } from "vitest";
import { itemsToRows, rowsToItems } from "../../../apps/api/src/lists.ts";

describe("sheet <-> list mapping", () => {
  it("reads a meal plan, skipping fully blank rows", () => {
    const items = rowsToItems("meals", [["Monday", "Tacos"], ["Tuesday", ""], ["", ""]]);
    expect(items.map((i) => [i.label, i.text])).toEqual([["Monday", "Tacos"], ["Tuesday", ""]]);
  });

  it("understands checkbox values from Sheets", () => {
    const items = rowsToItems("shopping", [["Milk", "TRUE", "Dairy"], ["Eggs", "FALSE", ""], ["Bread", "x"], ["", "TRUE"]]);
    expect(items.map((i) => i.done)).toEqual([true, false, true]);
    expect(items[0].label).toBe("Dairy");
  });

  it("round-trips", () => {
    const rows = itemsToRows("shopping", rowsToItems("shopping", [["Milk", "TRUE", "Dairy"]]));
    expect(rows).toEqual([["Milk", true, "Dairy"]]);
  });
});

import { eventsByDay } from "../src/calendar/display.tsx";

describe("calendar grouping", () => {
  it("spreads a multi-day all-day event across its days and keeps all-day first", () => {
    const map = eventsByDay(
      [
        { id: "a", title: "Trip", start: "2026-10-09", end: "2026-10-12", allDay: true, color: "#f00", source: "s" },
        { id: "b", title: "Lunch", start: "2026-10-09T17:00:00.000Z", end: "2026-10-09T18:00:00.000Z", allDay: false, color: "#0f0", source: "s" },
      ],
      "UTC",
      "12h",
    );
    expect([...map.keys()].sort()).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(map.get("2026-10-09")!.map((e) => e.title)).toEqual(["Trip", "Lunch"]);
    expect(map.get("2026-10-09")![1].when).toBe("5:00p");
  });

  it("does not spill an event ending at midnight into the next day", () => {
    const map = eventsByDay(
      [{ id: "c", title: "Party", start: "2026-10-09T22:00:00.000Z", end: "2026-10-10T00:00:00.000Z", allDay: false, color: "#00f", source: "s" }],
      "UTC",
      "24h",
    );
    expect([...map.keys()]).toEqual(["2026-10-09"]);
  });
});
