# Adding a module (widget)

A module is a folder in `packages/modules/src/<name>/` with three small files and one line in each of three registries. Nothing else changes: the Designer builds the settings form from your manifest, saves, validates, caches and live-previews it for you.

## 1. `manifest.ts`: what it is and its options

```ts
import type { ModuleManifest } from "../types.ts";

export const quoteManifest: ModuleManifest = {
  id: "quote",
  name: "Quote of the day",
  description: "A short quote",
  defaultSize: { w: 8, h: 3 },   // on the 24 x 14 grid
  refreshSec: 3600,               // 0 = no server data
  settings: [
    { key: "category", label: "Category", type: "select", default: "life",
      options: [{ value: "life", label: "Life" }, { value: "work", label: "Work" }] },
    { key: "showAuthor", label: "Show author", type: "boolean", default: true },
  ],
};
```

Setting types: `text`, `textarea`, `number`, `boolean`, `select`, `color`, `list`, `calendars`, `location`. Every widget also gets the common options (title, text size, colours, show-between-times) automatically.

## 2. `server.ts`: where the data comes from (optional)

Runs on the server, never in the TV's browser, so secrets stay private and results are cached for `refreshSec`.

```ts
import type { ModuleServer } from "../types.ts";

export const quoteServer: ModuleServer = {
  id: "quote",
  async load(settings, ctx) {
    const res = await ctx.fetch(`https://example.com/quote?c=${settings.category}`);
    return await res.json();
  },
};
```

`ctx` also gives you `getList(id)`, `googleCalendarEvents(...)`, the theme and `now()`. Return `{ error: "message" }` to show a friendly message on the widget.

## 3. `display.tsx`: how it looks

```tsx
import type { DisplayProps } from "../display-types.ts";

export function QuoteDisplay({ settings, data }: DisplayProps) {
  if (!data) return <div>Loading…</div>;
  return <div style={{ fontSize: "1.4em" }}>“{data.text}” {settings.showAuthor && <small>{data.author}</small>}</div>;
}
```

Use CSS variables `--text`, `--muted`, `--accent` and `em` units so it follows the theme and the widget's text size.

## 4. Register it (one line each)

- `packages/modules/src/index.ts`: add `quoteManifest` to `MANIFESTS`
- `packages/modules/src/server.ts`: add `quoteServer` to the list
- `packages/modules/src/display.tsx`: add `quote: QuoteDisplay` to `DISPLAYS`

Add a test next to `packages/modules/test/` if the module has logic worth pinning down.
