import type { ListInfo, ListItem, ModuleManifest, Theme, Widget } from "@hd/modules";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface DisplayDoc {
  id: string;
  name: string;
  token: string;
  url: string;
  layout: Widget[];
  theme: Theme;
  updatedAt: string;
  connected?: number;
}

export type { ListInfo, ListItem, ModuleManifest, Theme, Widget };
