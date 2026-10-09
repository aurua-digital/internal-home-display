import type { ServerResponse } from "node:http";

/** Server-sent events to connected displays, grouped by display id. */
export class DisplayEvents {
  private clients = new Map<string, Set<ServerResponse>>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const set of this.clients.values()) for (const res of set) res.write(": ping\n\n");
    }, 25_000);
    this.heartbeat.unref();
  }

  add(displayId: string, res: ServerResponse): void {
    let set = this.clients.get(displayId);
    if (!set) this.clients.set(displayId, (set = new Set()));
    set.add(res);
    res.on("close", () => set!.delete(res));
  }

  send(displayIds: string[], event: string, data: unknown = {}): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const id of displayIds) for (const res of this.clients.get(id) ?? []) res.write(msg);
  }

  count(displayId: string): number {
    return this.clients.get(displayId)?.size ?? 0;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const set of this.clients.values()) for (const res of set) res.end();
  }
}
