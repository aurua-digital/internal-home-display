import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Secret for signing sessions and encrypting stored tokens. */
  appSecret: string;
  /** Where the built web app lives (served as static files). Empty = don't serve. */
  webDist: string;
  /** Public base URL of this server, e.g. http://homedisplay.local:8080. Used for display links. */
  publicUrl: string;
  google: {
    clientId: string;
    clientSecret: string;
    /** If set, Google redirects here (web flow). If empty, use the loopback copy-paste flow. */
    redirectUri: string;
  };
  hostAgent: { url: string; token: string };
  secureCookies: boolean;
}

/** Read APP_SECRET from env, or create one in the data directory on first run. */
function loadSecret(dataDir: string): string {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const file = join(dataDir, "app-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  const dataDir = resolve(overrides.dataDir ?? env.DATA_DIR ?? "./data");
  mkdirSync(dataDir, { recursive: true });
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    dataDir,
    appSecret: overrides.appSecret ?? loadSecret(dataDir),
    webDist: env.WEB_DIST ?? resolve("../web/dist"),
    publicUrl: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirectUri: env.GOOGLE_REDIRECT_URI ?? "",
    },
    hostAgent: {
      url: (env.HOST_AGENT_URL ?? "http://127.0.0.1:8765").replace(/\/$/, ""),
      token: env.HOST_AGENT_TOKEN ?? "",
    },
    secureCookies: env.SECURE_COOKIES === "true",
    ...overrides,
  };
}
