import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.ts";
import { sha256, sign, verify } from "./crypto.ts";
import type { DB } from "./db.ts";

export const SESSION_COOKIE = "hd_session";
const SESSION_TTL = 60 * 60 * 24 * 30;

export interface Principal {
  userId: string;
  householdId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSession(reply: FastifyReply, config: Config, p: Principal): void {
  const token = sign({ uid: p.userId, hid: p.householdId }, config.appSecret, SESSION_TTL);
  const secure = config.secureCookies ? "; Secure" : "";
  reply.header("set-cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure}`);
}

export function clearSession(reply: FastifyReply): void {
  reply.header("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Session cookie (browser) or "Authorization: Bearer <api token>" (mobile app, MCP, scripts). */
export function authenticate(db: DB, config: Config, req: FastifyRequest): Principal | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const row = db
      .prepare(
        `SELECT t.id, u.id AS user_id, u.household_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
      )
      .get(sha256(auth.slice(7).trim())) as { id: string; user_id: string; household_id: string } | undefined;
    if (!row) return null;
    db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
    return { userId: row.user_id, householdId: row.household_id };
  }
  const cookie = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!cookie) return null;
  const payload = verify<{ uid: string; hid: string }>(cookie, config.appSecret);
  if (!payload) return null;
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(payload.uid);
  if (!user) return null;
  return { userId: payload.uid, householdId: payload.hid };
}
