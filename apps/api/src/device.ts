import type { Config } from "./config.ts";
import { HttpError } from "./lists.ts";

/**
 * Talks to the host agent (device/agent) that runs on the Pi outside Docker,
 * because the kiosk browser, HDMI-CEC and cron need the real machine.
 */
export class DeviceAgent {
  constructor(
    private config: Config,
    private http: typeof fetch = fetch,
  ) {}

  async call(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.http(`${this.config.hostAgent.url}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.config.hostAgent.token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new HttpError(503, "The device agent is not reachable. Is this running on the Pi with the agent installed?");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, (data as { error?: string }).error ?? `Device agent error ${res.status}`);
    return data;
  }
}
