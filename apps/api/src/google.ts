import type { CalendarEvent, CalendarSourceRef } from "@hd/modules";
import type { Config } from "./config.ts";
import { decrypt, encrypt, newId } from "./crypto.ts";
import type { DB } from "./db.ts";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  // drive.file: only files this app creates (the list Sheets), nothing else in Drive.
  "https://www.googleapis.com/auth/drive.file",
];

/** Used when no GOOGLE_REDIRECT_URI is configured: a "Desktop app" OAuth client redirects to loopback. */
export const LOOPBACK_REDIRECT = "http://127.0.0.1:53682/";

interface StoredTokens {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
}

export class GoogleError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export class Google {
  constructor(
    private db: DB,
    private config: Config,
    private http: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.google.clientId && this.config.google.clientSecret);
  }

  get redirectUri(): string {
    return this.config.google.redirectUri || LOOPBACK_REDIRECT;
  }

  get usesLoopback(): boolean {
    return !this.config.google.redirectUri;
  }

  authUrl(state: string): string {
    const q = new URLSearchParams({
      client_id: this.config.google.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  /** Exchange an auth code, store the account, return its id and email. */
  async connect(householdId: string, code: string): Promise<{ id: string; email: string }> {
    const res = await this.http("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.google.clientId,
        client_secret: this.config.google.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = (await res.json()) as any;
    if (!res.ok) throw new GoogleError(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`, 400);
    if (!body.refresh_token) throw new GoogleError("Google did not return a refresh token. Remove the app's access in your Google account and try again.", 400);

    const info = (await (
      await this.http("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${body.access_token}` } })
    ).json()) as { email?: string };
    const email = info.email ?? "google-account";
    const tokens: StoredTokens = {
      refresh_token: body.refresh_token,
      access_token: body.access_token,
      expires_at: Date.now() + (body.expires_in - 60) * 1000,
    };
    const enc = encrypt(JSON.stringify(tokens), this.config.appSecret);
    const existing = this.db
      .prepare("SELECT id FROM accounts WHERE household_id = ? AND provider = 'google' AND email = ?")
      .get(householdId, email) as { id: string } | undefined;
    const id = existing?.id ?? newId();
    if (existing) this.db.prepare("UPDATE accounts SET tokens_enc = ? WHERE id = ?").run(enc, id);
    else
      this.db
        .prepare("INSERT INTO accounts (id, household_id, provider, email, tokens_enc) VALUES (?, ?, 'google', ?, ?)")
        .run(id, householdId, email, enc);
    return { id, email };
  }

  private async accessToken(householdId: string, accountId: string): Promise<string> {
    const row = this.db
      .prepare("SELECT tokens_enc FROM accounts WHERE id = ? AND household_id = ? AND provider = 'google'")
      .get(accountId, householdId) as { tokens_enc: string } | undefined;
    if (!row) throw new GoogleError("Google account is not connected", 404);
    const tokens = JSON.parse(decrypt(row.tokens_enc, this.config.appSecret)) as StoredTokens;
    if (tokens.access_token && (tokens.expires_at ?? 0) > Date.now()) return tokens.access_token;

    const res = await this.http("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.google.clientId,
        client_secret: this.config.google.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const body = (await res.json()) as any;
    if (!res.ok) throw new GoogleError(`Google token refresh failed (${body.error ?? res.status}). Reconnect the account.`, 401);
    tokens.access_token = body.access_token;
    tokens.expires_at = Date.now() + (body.expires_in - 60) * 1000;
    this.db
      .prepare("UPDATE accounts SET tokens_enc = ? WHERE id = ?")
      .run(encrypt(JSON.stringify(tokens), this.config.appSecret), accountId);
    return body.access_token;
  }

  private async api<T>(householdId: string, accountId: string, url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.accessToken(householdId, accountId);
    const res = await this.http(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw new GoogleError(`Google API error: ${body.error?.message ?? res.status}`, res.status === 404 ? 404 : 502);
    return body as T;
  }

  // ----- Calendar -----

  async listCalendars(householdId: string, accountId: string) {
    const body = await this.api<any>(householdId, accountId, "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250");
    return (body.items ?? []).map((c: any) => ({
      id: c.id as string,
      name: (c.summaryOverride ?? c.summary) as string,
      color: (c.backgroundColor ?? "#4285f4") as string,
      primary: Boolean(c.primary),
    }));
  }

  async calendarEvents(householdId: string, src: CalendarSourceRef, from: Date, to: Date): Promise<CalendarEvent[]> {
    if (!src.accountId) throw new GoogleError("Calendar has no Google account", 400);
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });
    const body = await this.api<any>(
      householdId,
      src.accountId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(src.id)}/events?${q}`,
    );
    return (body.items ?? [])
      .filter((e: any) => e.status !== "cancelled")
      .map((e: any) => ({
        id: `${src.id}:${e.id}`,
        title: e.summary ?? "(no title)",
        start: e.start.date ?? e.start.dateTime,
        end: e.end?.date ?? e.end?.dateTime ?? e.start.date ?? e.start.dateTime,
        allDay: Boolean(e.start.date),
        location: e.location,
        color: src.color,
        source: src.id,
      }));
  }

  // ----- Sheets -----

  async createSheet(householdId: string, accountId: string, title: string, header: string[], rows: unknown[][], checkboxCol: number | null) {
    const sheet = await this.api<any>(householdId, accountId, "https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: "List", gridProperties: { frozenRowCount: 1 } } }] }),
    });
    const id = sheet.spreadsheetId as string;
    const sheetId = sheet.sheets[0].properties.sheetId as number;
    await this.writeRows(householdId, accountId, id, [header, ...rows]);
    const requests: object[] = [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold",
        },
      },
      { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: header.length } } },
    ];
    if (checkboxCol !== null) {
      requests.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: checkboxCol, endColumnIndex: checkboxCol + 1 },
          rule: { condition: { type: "BOOLEAN" } },
        },
      });
    }
    await this.api(householdId, accountId, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
    return { id, url: sheet.spreadsheetUrl as string };
  }

  async readRows(householdId: string, accountId: string, spreadsheetId: string): Promise<string[][]> {
    const body = await this.api<any>(
      householdId,
      accountId,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/List!A1:Z1000?valueRenderOption=FORMATTED_VALUE`,
    );
    return (body.values ?? []) as string[][];
  }

  /** Replace the whole sheet contents with rows (row 0 = header). */
  async writeRows(householdId: string, accountId: string, spreadsheetId: string, rows: unknown[][]): Promise<void> {
    await this.api(householdId, accountId, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/List!A1:Z1000:clear`, {
      method: "POST",
      body: "{}",
    });
    await this.api(
      householdId,
      accountId,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/List!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: rows }) },
    );
  }

  async share(householdId: string, accountId: string, fileId: string, email: string): Promise<void> {
    await this.api(householdId, accountId, `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=true`, {
      method: "POST",
      body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
    });
  }
}
