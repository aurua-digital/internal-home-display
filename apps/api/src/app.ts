import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { DEFAULT_THEME, MANIFESTS, getManifest, resolveSettings, type ModuleContext, type Theme, type Widget } from "@hd/modules";
import { SERVERS } from "@hd/modules/server";
import { authenticate, clearSession, setSession, type Principal } from "./auth.ts";
import type { Config } from "./config.ts";
import { hashPassword, newId, newToken, sha256, sign, verify, verifyPassword } from "./crypto.ts";
import { openDb, tx, type DB } from "./db.ts";
import { DeviceAgent } from "./device.ts";
import { DisplayEvents } from "./events.ts";
import { Google, GoogleError } from "./google.ts";
import { HttpError, Lists } from "./lists.ts";

export interface AppDeps {
  config: Config;
  db?: DB;
  /** Outbound HTTP for modules, Google and the device agent (stubbed in tests). */
  http?: typeof fetch;
  now?: () => Date;
}

interface DisplayRow {
  id: string;
  household_id: string;
  name: string;
  token: string;
  layout_json: string;
  theme_json: string;
  updated_at: string;
}

function publicDisplay(r: DisplayRow, config: Config) {
  return {
    id: r.id,
    name: r.name,
    token: r.token,
    url: `${config.publicUrl}/d/${r.token}`,
    layout: JSON.parse(r.layout_json) as Widget[],
    theme: { ...DEFAULT_THEME, ...JSON.parse(r.theme_json) } as Theme,
    updatedAt: r.updated_at,
  };
}

/** Keep only known modules and sane grid positions. */
function cleanLayout(input: unknown): Widget[] {
  if (!Array.isArray(input)) throw new HttpError(400, "layout must be an array");
  const seen = new Set<string>();
  return input.map((w: any) => {
    if (!w || typeof w !== "object") throw new HttpError(400, "invalid widget");
    if (!getManifest(w.module)) throw new HttpError(400, `unknown module "${w.module}"`);
    const id = typeof w.id === "string" && w.id && !seen.has(w.id) ? w.id : newId();
    seen.add(id);
    const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
    return {
      id,
      module: w.module,
      x: int(w.x, 0, 23),
      y: int(w.y, 0, 13),
      w: int(w.w, 1, 24),
      h: int(w.h, 1, 14),
      settings: w.settings && typeof w.settings === "object" ? w.settings : {},
    };
  });
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const db = deps.db ?? openDb(config.dataDir);
  const http = deps.http ?? fetch;
  const now = deps.now ?? (() => new Date());
  const events = new DisplayEvents();
  const google = new Google(db, config, http);
  const device = new DeviceAgent(config, http);

  const displayIdsFor = (householdId: string) =>
    (db.prepare("SELECT id FROM displays WHERE household_id = ?").all(householdId) as { id: string }[]).map((r) => r.id);

  const dataCache = new Map<string, { at: number; data: unknown }>();
  const lists = new Lists(db, google, (householdId, listId) => {
    for (const key of dataCache.keys()) if (key.includes(listId)) dataCache.delete(key);
    events.send(displayIdsFor(householdId), "data", { listId });
  });

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });

  app.setErrorHandler((err: any, _req, reply) => {
    const status = err instanceof HttpError || err instanceof GoogleError ? err.status : (err.statusCode ?? 500);
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ error: status >= 500 && !(err instanceof GoogleError) ? "Internal error" : err.message });
  });
  app.addHook("onClose", async () => events.close());

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const p = authenticate(db, config, req);
    if (!p) return reply.status(401).send({ error: "Sign in required" });
    req.principal = p;
  };
  const me = (req: FastifyRequest): Principal => req.principal!;

  const moduleContext = (householdId: string, theme: Theme): ModuleContext => ({
    householdId,
    theme,
    fetch: http,
    now,
    getList: (id) => lists.get(householdId, id).catch((e) => (e instanceof HttpError && e.status === 404 ? null : Promise.reject(e))),
    googleCalendarEvents: (src, from, to) => google.calendarEvents(householdId, src, from, to),
  });

  /** Load a widget's data through its module, cached for the module's refresh interval. */
  async function widgetData(householdId: string, theme: Theme, widget: Pick<Widget, "module" | "settings">) {
    const manifest = getManifest(widget.module);
    const server = SERVERS[widget.module];
    if (!manifest || !server) return null;
    const settings = resolveSettings(manifest, widget.settings);
    const key = `${householdId}:${widget.module}:${theme.units}:${JSON.stringify(widget.settings)}`;
    const ttl = Math.max(30, manifest.refreshSec - 5) * 1000;
    const hit = dataCache.get(key);
    if (hit && now().getTime() - hit.at < ttl) return hit.data;
    try {
      const data = await server.load(settings, moduleContext(householdId, theme));
      dataCache.set(key, { at: now().getTime(), data });
      if (dataCache.size > 500) dataCache.delete(dataCache.keys().next().value!);
      return data;
    } catch (err) {
      app.log.warn({ err, module: widget.module }, "module data failed");
      // Keep showing the last good data when the network is down (TEC-9).
      if (hit) return { ...(hit.data as object), stale: true };
      return { error: (err as Error).message };
    }
  }

  // ---------- Health ----------
  app.get("/api/health", async () => ({ ok: true, time: now().toISOString() }));

  // ---------- Setup and sign-in ----------
  const userCount = () => (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

  app.get("/api/setup", async () => ({ needsSetup: userCount() === 0, google: google.configured }));

  app.post("/api/setup", async (req, reply) => {
    if (userCount() > 0) throw new HttpError(409, "Already set up");
    const b = (req.body ?? {}) as Record<string, string>;
    if (!b.email || !b.password || b.password.length < 8) throw new HttpError(400, "Email and a password of at least 8 characters are required");
    const householdId = newId();
    const userId = newId();
    const displayId = newId();
    tx(db, () => {
      db.prepare("INSERT INTO households (id, name) VALUES (?, ?)").run(householdId, b.householdName || "Home");
      db.prepare("INSERT INTO users (id, household_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)").run(
        userId,
        householdId,
        b.email.trim().toLowerCase(),
        b.name || b.email,
        hashPassword(b.password),
      );
      db.prepare("INSERT INTO displays (id, household_id, name, token, layout_json) VALUES (?, ?, ?, ?, ?)").run(
        displayId,
        householdId,
        "Living room TV",
        newToken(),
        "[]",
      );
    });
    const meals = lists.create(householdId, { kind: "meals", name: "Dinners" });
    const shopping = lists.create(householdId, { kind: "shopping", name: "Shopping" });
    lists.create(householdId, { kind: "todo", name: "To-do" });
    db.prepare("UPDATE displays SET layout_json = ? WHERE id = ?").run(
      JSON.stringify(starterLayout({ meals: meals.id, shopping: shopping.id })),
      displayId,
    );
    setSession(reply, config, { userId, householdId });
    return { ok: true };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>;
    const user = db.prepare("SELECT id, household_id, password_hash FROM users WHERE email = ?").get((b.email ?? "").trim().toLowerCase()) as
      | { id: string; household_id: string; password_hash: string }
      | undefined;
    if (!user || !verifyPassword(b.password ?? "", user.password_hash)) {
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, "Wrong email or password");
    }
    setSession(reply, config, { userId: user.id, householdId: user.household_id });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => {
    const p = me(req);
    const user = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(p.userId);
    const household = db.prepare("SELECT id, name FROM households WHERE id = ?").get(p.householdId);
    return { user, household };
  });

  // ---------- Kiosk auto-pairing ----------
  // A fresh Pi has no display address yet. The kiosk page on the Pi itself asks here and is
  // handed the first display's link. Only answers requests that come straight from this machine.
  app.get("/api/pair/local", async (req) => {
    const addr = req.socket.remoteAddress ?? "";
    const local = addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
    // Anything behind a tunnel or reverse proxy carries forwarding headers: refuse those.
    if (!local || req.headers["x-forwarded-for"] || req.headers["x-forwarded-host"]) throw new HttpError(403, "Only available on the device itself");
    const row = db.prepare("SELECT token FROM displays ORDER BY rowid LIMIT 1").get() as { token: string } | undefined;
    if (!row) throw new HttpError(404, "Not set up yet");
    return { path: `/d/${row.token}` };
  });

  // ---------- Display (public, by secret token) ----------
  const displayByToken = (token: string) => {
    const row = db.prepare("SELECT * FROM displays WHERE token = ?").get(token) as DisplayRow | undefined;
    if (!row) throw new HttpError(404, "Display not found. The link may have been regenerated.");
    return row;
  };

  app.get("/api/d/:token", async (req) => {
    const d = publicDisplay(displayByToken((req.params as { token: string }).token), config);
    return { id: d.id, name: d.name, layout: d.layout, theme: d.theme, updatedAt: d.updatedAt };
  });

  app.get("/api/d/:token/widgets/:widgetId", async (req) => {
    const { token, widgetId } = req.params as { token: string; widgetId: string };
    const row = displayByToken(token);
    const d = publicDisplay(row, config);
    const widget = d.layout.find((w) => w.id === widgetId);
    if (!widget) throw new HttpError(404, "Widget not found");
    return { data: await widgetData(row.household_id, d.theme, widget) };
  });

  app.get("/api/d/:token/events", async (req, reply) => {
    const row = displayByToken((req.params as { token: string }).token);
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ updatedAt: row.updated_at })}\n\n`);
    events.add(row.id, reply.raw);
  });

  // ---------- Everything below needs a signed-in user or API token ----------
  app.register(async (admin) => {
    admin.addHook("preHandler", requireAuth);

    admin.get("/api/modules", async () => MANIFESTS);

    // Displays
    const displayRow = (householdId: string, id: string) => {
      const row = db.prepare("SELECT * FROM displays WHERE id = ? AND household_id = ?").get(id, householdId) as DisplayRow | undefined;
      if (!row) throw new HttpError(404, "Display not found");
      return row;
    };

    admin.get("/api/displays", async (req) =>
      (db.prepare("SELECT * FROM displays WHERE household_id = ? ORDER BY name").all(me(req).householdId) as unknown as DisplayRow[]).map((r) => ({
        ...publicDisplay(r, config),
        connected: events.count(r.id),
      })),
    );

    admin.post("/api/displays", async (req) => {
      const b = (req.body ?? {}) as { name?: string };
      const id = newId();
      const existing = lists.all(me(req).householdId);
      db.prepare("INSERT INTO displays (id, household_id, name, token, layout_json) VALUES (?, ?, ?, ?, ?)").run(
        id,
        me(req).householdId,
        b.name?.trim() || "New display",
        newToken(),
        JSON.stringify(
          starterLayout({ meals: existing.find((l) => l.kind === "meals")?.id, shopping: existing.find((l) => l.kind === "shopping")?.id }),
        ),
      );
      return publicDisplay(displayRow(me(req).householdId, id), config);
    });

    admin.get("/api/displays/:id", async (req) => publicDisplay(displayRow(me(req).householdId, (req.params as any).id), config));

    /** Save name, layout and/or theme. Connected TVs reload within a second (ADM-4). */
    admin.put("/api/displays/:id", async (req) => {
      const { id } = req.params as { id: string };
      const row = displayRow(me(req).householdId, id);
      const b = (req.body ?? {}) as { name?: string; layout?: unknown; theme?: Partial<Theme> };
      const layout = b.layout !== undefined ? cleanLayout(b.layout) : JSON.parse(row.layout_json);
      const theme = b.theme !== undefined ? { ...JSON.parse(row.theme_json), ...b.theme } : JSON.parse(row.theme_json);
      db.prepare("UPDATE displays SET name = ?, layout_json = ?, theme_json = ?, updated_at = datetime('now') WHERE id = ?").run(
        b.name?.trim() || row.name,
        JSON.stringify(layout),
        JSON.stringify(theme),
        id,
      );
      events.send([id], "layout", {});
      return publicDisplay(displayRow(me(req).householdId, id), config);
    });

    /** Patch one widget's settings, e.g. from an AI tool: { settings: { days: 7 } } */
    admin.patch("/api/displays/:id/widgets/:widgetId", async (req) => {
      const { id, widgetId } = req.params as { id: string; widgetId: string };
      const row = displayRow(me(req).householdId, id);
      const layout = JSON.parse(row.layout_json) as Widget[];
      const w = layout.find((x) => x.id === widgetId);
      if (!w) throw new HttpError(404, "Widget not found");
      const b = (req.body ?? {}) as Partial<Widget>;
      Object.assign(w, {
        ...(b.x !== undefined ? { x: b.x } : {}),
        ...(b.y !== undefined ? { y: b.y } : {}),
        ...(b.w !== undefined ? { w: b.w } : {}),
        ...(b.h !== undefined ? { h: b.h } : {}),
      });
      w.settings = { ...w.settings, ...(b.settings ?? {}) };
      db.prepare("UPDATE displays SET layout_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(cleanLayout(layout)), id);
      events.send([id], "layout", {});
      return publicDisplay(displayRow(me(req).householdId, id), config);
    });

    admin.post("/api/displays/:id/token", async (req) => {
      const { id } = req.params as { id: string };
      displayRow(me(req).householdId, id);
      events.send([id], "revoked", {});
      db.prepare("UPDATE displays SET token = ? WHERE id = ?").run(newToken(), id);
      return publicDisplay(displayRow(me(req).householdId, id), config);
    });

    admin.delete("/api/displays/:id", async (req) => {
      const { id } = req.params as { id: string };
      displayRow(me(req).householdId, id);
      db.prepare("DELETE FROM displays WHERE id = ?").run(id);
      return { ok: true };
    });

    /** Data for an unsaved widget, so the designer previews changes live (ADM-3). */
    admin.post("/api/preview/data", async (req) => {
      const b = (req.body ?? {}) as { module: string; settings?: Record<string, unknown>; theme?: Partial<Theme> };
      if (!getManifest(b.module)) throw new HttpError(400, "Unknown module");
      return { data: await widgetData(me(req).householdId, { ...DEFAULT_THEME, ...b.theme }, { module: b.module, settings: b.settings ?? {} }) };
    });

    // Lists
    admin.get("/api/lists", async (req) => lists.all(me(req).householdId));
    admin.post("/api/lists", async (req) => lists.create(me(req).householdId, (req.body ?? {}) as any));
    admin.get("/api/lists/:id", async (req) => lists.get(me(req).householdId, (req.params as any).id));
    admin.put("/api/lists/:id", async (req) => lists.rename(me(req).householdId, (req.params as any).id, String((req.body as any)?.name ?? "")));
    admin.delete("/api/lists/:id", async (req) => {
      lists.delete(me(req).householdId, (req.params as any).id);
      return { ok: true };
    });
    admin.post("/api/lists/:id/items", async (req) => ({ items: await lists.addItem(me(req).householdId, (req.params as any).id, (req.body ?? {}) as any) }));
    admin.put("/api/lists/:id/items", async (req) => {
      const items = (req.body as any)?.items;
      if (!Array.isArray(items)) throw new HttpError(400, "items must be an array");
      return { items: await lists.replaceItems(me(req).householdId, (req.params as any).id, items) };
    });
    admin.patch("/api/lists/:id/items/:itemId", async (req) => {
      const { id, itemId } = req.params as { id: string; itemId: string };
      return { items: await lists.updateItem(me(req).householdId, id, itemId, (req.body ?? {}) as any) };
    });
    admin.delete("/api/lists/:id/items/:itemId", async (req) => {
      const { id, itemId } = req.params as { id: string; itemId: string };
      return { items: await lists.removeItem(me(req).householdId, id, itemId) };
    });
    admin.post("/api/lists/:id/sheet", async (req) => {
      const b = (req.body ?? {}) as { accountId?: string; shareWith?: string[] };
      if (!b.accountId) throw new HttpError(400, "accountId is required: connect a Google account first");
      return lists.linkSheet(me(req).householdId, (req.params as any).id, b.accountId, b.shareWith ?? []);
    });
    admin.delete("/api/lists/:id/sheet", async (req) => lists.unlinkSheet(me(req).householdId, (req.params as any).id));

    // Connected accounts (Google)
    admin.get("/api/accounts", async (req) =>
      db.prepare("SELECT id, provider, email, created_at AS createdAt FROM accounts WHERE household_id = ?").all(me(req).householdId),
    );
    admin.delete("/api/accounts/:id", async (req) => {
      db.prepare("DELETE FROM accounts WHERE id = ? AND household_id = ?").run((req.params as any).id, me(req).householdId);
      return { ok: true };
    });
    admin.get("/api/accounts/:id/calendars", async (req) => google.listCalendars(me(req).householdId, (req.params as any).id));

    admin.get("/api/google/auth-url", async (req) => {
      if (!google.configured) throw new HttpError(400, "Google is not set up: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the .env file");
      const state = sign({ hid: me(req).householdId, n: newToken(8) }, config.appSecret, 900);
      return { url: google.authUrl(state), loopback: google.usesLoopback, redirectUri: google.redirectUri };
    });

    /** Loopback flow: the user pastes the URL Google sent them to (or just the code). */
    admin.post("/api/google/exchange", async (req) => {
      const b = (req.body ?? {}) as { url?: string; code?: string };
      let code = b.code?.trim();
      if (!code && b.url) {
        const u = new URL(b.url.trim());
        code = u.searchParams.get("code") ?? undefined;
        const state = u.searchParams.get("state");
        if (!state || verify<{ hid: string }>(state, config.appSecret)?.hid !== me(req).householdId)
          throw new HttpError(400, "That link is expired or not from this app. Start again.");
      }
      if (!code) throw new HttpError(400, "No code found in that link");
      return google.connect(me(req).householdId, code);
    });

    // API tokens for the mobile app, scripts and AI tools
    admin.get("/api/tokens", async (req) =>
      db.prepare("SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt FROM api_tokens WHERE user_id = ?").all(me(req).userId),
    );
    admin.post("/api/tokens", async (req) => {
      const token = `hd_${newToken(32)}`;
      const id = newId();
      db.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash) VALUES (?, ?, ?, ?)").run(
        id,
        me(req).userId,
        String((req.body as any)?.name ?? "API token"),
        sha256(token),
      );
      return { id, token };
    });
    admin.delete("/api/tokens/:id", async (req) => {
      db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run((req.params as any).id, me(req).userId);
      return { ok: true };
    });

    // Place search for the weather module
    admin.get("/api/geocode", async (req) => {
      const q = String((req.query as any).q ?? "").trim();
      if (q.length < 2) return [];
      const res = await http(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: "8", format: "json" })}`);
      const body = (await res.json()) as any;
      return (body.results ?? []).map((r: any) => ({
        name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
        latitude: r.latitude,
        longitude: r.longitude,
      }));
    });

    // Raspberry Pi device manager (proxied to the host agent)
    admin.get("/api/device/status", async () => device.call("GET", "/status"));
    admin.get("/api/device/config", async () => device.call("GET", "/config"));
    admin.put("/api/device/config", async (req) => device.call("PUT", "/config", req.body ?? {}));
    admin.post("/api/device/tv/:action", async (req) => {
      const action = (req.params as any).action;
      if (!["on", "off", "status"].includes(action)) throw new HttpError(400, "action must be on, off or status");
      return device.call("POST", `/tv/${action}`);
    });
    admin.post("/api/device/kiosk/restart", async () => device.call("POST", "/kiosk/restart"));
    admin.post("/api/device/reboot", async () => device.call("POST", "/reboot"));
  });

  /** Web flow: Google redirects the browser here when GOOGLE_REDIRECT_URI points at this server. */
  app.get("/api/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const state = q.state ? verify<{ hid: string }>(q.state, config.appSecret) : null;
    if (q.error || !q.code || !state) return reply.redirect(`/settings?google=error&reason=${encodeURIComponent(q.error ?? "invalid")}`);
    await google.connect(state.hid, q.code);
    return reply.redirect("/settings?google=connected");
  });

  // ---------- Web app (admin + display) ----------
  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}

/** What a new display starts with, so it looks good before anything is set up. */
function starterLayout(lists: { meals?: string; shopping?: string } = {}): Widget[] {
  return [
    { id: newId(), module: "clock", x: 0, y: 0, w: 8, h: 3, settings: { showTitle: false } },
    { id: newId(), module: "weather", x: 0, y: 3, w: 8, h: 5, settings: {} },
    { id: newId(), module: "calendar", x: 8, y: 0, w: 10, h: 14, settings: {} },
    { id: newId(), module: "list", x: 18, y: 0, w: 6, h: 7, settings: { title: "Dinners", listId: lists.meals ?? "" } },
    { id: newId(), module: "list", x: 18, y: 7, w: 6, h: 7, settings: { title: "Shopping", listId: lists.shopping ?? "" } },
  ];
}
