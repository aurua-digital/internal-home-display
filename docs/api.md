# API

Everything in the admin app uses this API, so a mobile app, scripts and AI tools can do the same things.

**Auth:** create a token in **Settings → Access tokens**, then send `Authorization: Bearer hd_…`. (The browser uses a session cookie.)

| Method and path | Does |
| --- | --- |
| `GET /api/modules` | Module list with their settings (use this to know what can be configured) |
| `GET /api/displays` | Displays with layout, theme and link |
| `PUT /api/displays/:id` | Save `{ name?, layout?, theme? }`; connected TVs refresh |
| `PATCH /api/displays/:id/widgets/:widgetId` | Change one widget: `{ settings: { days: 7 } }` or `{ x, y, w, h }` |
| `POST /api/displays/:id/token` | Make a new secret link (old one stops) |
| `POST /api/preview/data` | Data for unsaved settings: `{ module, settings, theme }` |
| `GET/POST /api/lists`, `GET/PUT/DELETE /api/lists/:id` | Lists |
| `POST /api/lists/:id/items`, `PATCH/DELETE /api/lists/:id/items/:itemId`, `PUT /api/lists/:id/items` | Items (works the same for lists stored in Google Sheets) |
| `POST /api/lists/:id/sheet`, `DELETE /api/lists/:id/sheet` | Create and link a Google Sheet; stop syncing |
| `GET /api/accounts`, `GET /api/accounts/:id/calendars` | Connected Google accounts and their calendars |
| `GET /api/device/status`, `GET/PUT /api/device/config`, `POST /api/device/tv/on\|off`, `POST /api/device/kiosk/restart`, `POST /api/device/reboot` | The Pi (through the device agent) |

Example, "show 7 days of weather":

```sh
curl -X PATCH $HOST/api/displays/$DISPLAY/widgets/$WIDGET \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"settings":{"days":7}}'
```

Public (no login, secret link only): `GET /api/d/:token`, `GET /api/d/:token/widgets/:id`, `GET /api/d/:token/events` (live updates).

An MCP server for Claude is planned as a thin layer over this API ([status](status.md)).
