import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:one@test
DTSTART:20261010T150000Z
DTEND:20261010T160000Z
SUMMARY:Dentist
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
DTSTART:20261005T180000Z
DTEND:20261005T190000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Piano
END:VEVENT
BEGIN:VEVENT
UID:day@test
DTSTART;VALUE=DATE:20261011
DTEND;VALUE=DATE:20261012
SUMMARY:Birthday
END:VEVENT
END:VCALENDAR`;

const WEATHER = {
  current: { temperature_2m: 61, apparent_temperature: 58, relative_humidity_2m: 50, weather_code: 3, wind_speed_10m: 5, is_day: 1 },
  hourly: { time: ["2026-10-09T20:00"], temperature_2m: [60], weather_code: [3], precipitation_probability: [10] },
  daily: {
    time: ["2026-10-09", "2026-10-10", "2026-10-11"],
    weather_code: [3, 61, 0],
    temperature_2m_max: [65, 60, 70],
    temperature_2m_min: [50, 48, 52],
    precipitation_probability_max: [10, 80, 0],
    sunrise: ["a", "b", "c"],
    sunset: ["a", "b", "c"],
  },
};

let app: FastifyInstance;
let weatherUrls: string[];
let cookie: string;

const stubFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("open-meteo.com/v1/forecast")) {
    weatherUrls.push(url);
    return new Response(JSON.stringify(WEATHER), { status: 200 });
  }
  if (url === "https://example.com/cal.ics") return new Response(ICS, { status: 200 });
  return new Response("nope", { status: 404 });
};

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({ method: method as any, url, payload: body as any, headers: { cookie, ...headers } });
  const set = res.headers["set-cookie"];
  if (set) cookie = String(set).split(";")[0];
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

beforeEach(async () => {
  weatherUrls = [];
  cookie = "";
  const dir = mkdtempSync(join(tmpdir(), "hd-"));
  const config = loadConfig({ dataDir: dir, webDist: "", appSecret: "test-secret" });
  app = await buildApp({ config, db: openDb(":memory:"), http: stubFetch, now: () => new Date("2026-10-09T19:00:00Z") });
  await call("POST", "/api/setup", { email: "a@b.co", password: "password123", name: "A" });
});

afterEach(() => app.close());

describe("auth", () => {
  it("requires sign-in for admin routes and setup only once", async () => {
    cookie = "";
    expect((await call("GET", "/api/displays")).status).toBe(401);
    expect((await call("POST", "/api/setup", { email: "x@y.z", password: "password123" })).status).toBe(409);
    expect((await call("POST", "/api/auth/login", { email: "a@b.co", password: "wrongwrong" })).status).toBe(401);
    expect((await call("POST", "/api/auth/login", { email: "a@b.co", password: "password123" })).status).toBe(200);
    expect((await call("GET", "/api/displays")).status).toBe(200);
  });

  it("accepts API tokens", async () => {
    const { body } = await call("POST", "/api/tokens", { name: "mcp" });
    cookie = "";
    const res = await call("GET", "/api/displays", undefined, { authorization: `Bearer ${body.token}` });
    expect(res.status).toBe(200);
  });
});

describe("displays", () => {
  it("starts with a usable layout and lists", async () => {
    const [display] = (await call("GET", "/api/displays")).body;
    expect(display.layout.map((w: any) => w.module)).toEqual(["clock", "weather", "calendar", "list", "list"]);
    const lists = (await call("GET", "/api/lists")).body;
    expect(lists.map((l: any) => l.kind).sort()).toEqual(["meals", "shopping", "todo"]);
    expect(display.layout[3].settings.listId).toBe(lists.find((l: any) => l.kind === "meals").id);
  });

  it("serves the public display by token only, and stops after the token is regenerated", async () => {
    const [display] = (await call("GET", "/api/displays")).body;
    cookie = "";
    expect((await call("GET", `/api/d/${display.token}`)).status).toBe(200);
    expect((await call("GET", `/api/d/wrong`)).status).toBe(404);
    await call("POST", "/api/auth/login", { email: "a@b.co", password: "password123" });
    const fresh = (await call("POST", `/api/displays/${display.id}/token`)).body;
    expect(fresh.token).not.toBe(display.token);
    expect((await call("GET", `/api/d/${display.token}`)).status).toBe(404);
  });

  it("drops unknown modules and clamps positions when saving", async () => {
    const [display] = (await call("GET", "/api/displays")).body;
    const bad = await call("PUT", `/api/displays/${display.id}`, { layout: [{ module: "nope", x: 0, y: 0, w: 1, h: 1 }] });
    expect(bad.status).toBe(400);
    const ok = await call("PUT", `/api/displays/${display.id}`, { layout: [{ module: "clock", x: -5, y: 99, w: 100, h: 0 }] });
    expect(ok.body.layout[0]).toMatchObject({ x: 0, y: 13, w: 24, h: 1 });
  });

  it("changes one setting without touching the rest (AI-style edit)", async () => {
    const [display] = (await call("GET", "/api/displays")).body;
    const weather = display.layout.find((w: any) => w.module === "weather");
    await call("PATCH", `/api/displays/${display.id}/widgets/${weather.id}`, {
      settings: { location: { name: "Austin", latitude: 30.27, longitude: -97.74 }, units: "metric" },
    });
    const res = await call("PATCH", `/api/displays/${display.id}/widgets/${weather.id}`, { settings: { days: 7 } });
    const updated = res.body.layout.find((w: any) => w.id === weather.id);
    expect(updated.settings).toMatchObject({ days: 7, units: "metric", location: { name: "Austin" } });
  });
});

describe("modules", () => {
  it("weather asks for the requested number of days and metric units", async () => {
    const { body } = await call("POST", "/api/preview/data", {
      module: "weather",
      settings: { location: { name: "Austin", latitude: 30.27, longitude: -97.74 }, days: 2, units: "metric" },
    });
    expect(weatherUrls[0]).toContain("forecast_days=3");
    expect(weatherUrls[0]).toContain("temperature_unit=celsius");
    expect(body.data.daily).toHaveLength(2);
    expect(body.data.current.temp).toBe(61);
  });

  it("weather without a location asks for one", async () => {
    const { body } = await call("POST", "/api/preview/data", { module: "weather", settings: {} });
    expect(body.data.error).toMatch(/location/);
  });

  it("calendar reads ICS links and expands repeating events", async () => {
    const { body } = await call("POST", "/api/preview/data", {
      module: "calendar",
      settings: { sources: [{ type: "ics", id: "https://example.com/cal.ics", name: "Family", color: "#f00" }], view: "agenda", days: 11 },
    });
    const titles = body.data.events.map((e: any) => e.title);
    expect(titles).toContain("Dentist");
    expect(titles).toContain("Birthday");
    expect(titles.filter((t: string) => t === "Piano")).toHaveLength(2); // Oct 12 and Oct 19
    expect(body.data.events.find((e: any) => e.title === "Birthday").allDay).toBe(true);
    expect(body.data.errors).toEqual([]);
  });

  it("calendar reports a broken source without failing the whole widget", async () => {
    const { body } = await call("POST", "/api/preview/data", {
      module: "calendar",
      settings: { sources: [{ type: "ics", id: "https://example.com/missing.ics", name: "Broken", color: "#f00" }] },
    });
    expect(body.data.events).toEqual([]);
    expect(body.data.errors[0]).toMatch(/Broken/);
  });
});

describe("lists", () => {
  it("meal plan starts with seven blank days", async () => {
    const lists = (await call("GET", "/api/lists")).body;
    const meals = (await call("GET", `/api/lists/${lists.find((l: any) => l.kind === "meals").id}`)).body;
    expect(meals.items.map((i: any) => i.label)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  });

  it("adds, checks and removes items", async () => {
    const list = (await call("POST", "/api/lists", { kind: "todo", name: "Chores" })).body;
    const { items } = (await call("POST", `/api/lists/${list.id}/items`, { text: "Trash" })).body;
    expect(items).toHaveLength(1);
    const done = (await call("PATCH", `/api/lists/${list.id}/items/${items[0].id}`, { done: true })).body;
    expect(done.items[0].done).toBe(true);
    const gone = (await call("DELETE", `/api/lists/${list.id}/items/${items[0].id}`)).body;
    expect(gone.items).toEqual([]);
  });

  it("tells connected displays to refresh the list", async () => {
    // Data cache must not serve a stale list after an edit.
    const lists = (await call("GET", "/api/lists")).body;
    const shopping = lists.find((l: any) => l.kind === "shopping");
    const settings = { listId: shopping.id };
    const before = (await call("POST", "/api/preview/data", { module: "list", settings })).body.data;
    expect(before.items).toEqual([]);
    await call("POST", `/api/lists/${shopping.id}/items`, { text: "Milk", label: "Dairy" });
    const after = (await call("POST", "/api/preview/data", { module: "list", settings })).body.data;
    expect(after.items.map((i: any) => i.text)).toEqual(["Milk"]);
  });

  it("is isolated per household", async () => {
    const list = (await call("POST", "/api/lists", { kind: "todo" })).body;
    expect((await call("GET", `/api/lists/${list.id}`)).status).toBe(200);
    expect((await call("GET", `/api/lists/not-mine`)).status).toBe(404);
  });
});

describe("kiosk pairing", () => {
  it("hands the first display link to the device itself, but not to forwarded or remote callers", async () => {
    const [display] = (await call("GET", "/api/displays")).body;
    const local = await app.inject({ method: "GET", url: "/api/pair/local", remoteAddress: "127.0.0.1" });
    expect(local.statusCode).toBe(200);
    expect(local.json().path).toBe(`/d/${display.token}`);
    const forwarded = await app.inject({ method: "GET", url: "/api/pair/local", remoteAddress: "127.0.0.1", headers: { "x-forwarded-for": "8.8.8.8" } });
    expect(forwarded.statusCode).toBe(403);
    const remote = await app.inject({ method: "GET", url: "/api/pair/local", remoteAddress: "192.168.1.20" });
    expect(remote.statusCode).toBe(403);
  });
});
