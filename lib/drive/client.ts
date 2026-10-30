import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken, encryptToken } from "./crypto";

// Google Drive storage for timeline photos.
//
// An admin connects the family's Google account once (OAuth, offline access).
// The only permission asked for is drive.file: the site can see and manage the
// files it created itself, nothing else in that Drive. Everything is stored in
// one "Big Fat Family Tree" folder. Files are never shared publicly; members
// get them through /api/media after an approval check.
//
// Uploads are resumable sessions started here; the browser sends 4 MB chunks
// to /api/media/upload/[id], which forwards them, so session URLs and tokens
// never reach the browser.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_NAME = "Big Fat Family Tree";

type Config = { clientId: string; clientSecret: string; key: string };

/** OAuth client and token key from the environment, or null when Drive isn't set up. */
export function driveConfig(): Config | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const key = process.env.DRIVE_TOKEN_KEY?.trim();
  return clientId && clientSecret && key ? { clientId, clientSecret, key } : null;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly reconnect = false,
  ) {
    super(message);
  }
}

const timeout = (ms: number) => AbortSignal.timeout(ms);

// ── OAuth ───────────────────────────────────────────────────────────────────

export function authUrl(redirectUri: string, state: string): string {
  const cfg = driveConfig();
  if (!cfg) throw new DriveError("Google Drive isn't set up yet.", 503);
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    const revoked = json.error === "invalid_grant";
    throw new DriveError(revoked ? "Google Drive access was removed. An admin needs to reconnect it." : "Couldn't reach Google Drive.", revoked ? 503 : 502, revoked);
  }
  return json;
}

/** The account the admin signed in with, from the ID token (we asked for "email"). */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * Finish connecting: swap the code for tokens, make the family folder, and
 * store the refresh token encrypted. Replaces any earlier connection.
 */
export async function completeConnection(code: string, redirectUri: string, adminId: string): Promise<{ email: string | null }> {
  const cfg = driveConfig();
  if (!cfg) throw new DriveError("Google Drive isn't set up yet.", 503);
  const tokens = await tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) throw new DriveError("Google didn't grant offline access. Please try connecting again.", 400);
  if (!tokens.scope?.split(" ").includes(SCOPE)) throw new DriveError("Drive permission wasn't granted. Please tick the Drive box when connecting.", 400);

  // Reconnecting the same account keeps using its existing folder.
  const db = createServiceClient();
  const { data: previous } = await db.from("drive_connection").select("root_folder_id").eq("id", 1).maybeSingle();
  let folderId: string | null = null;
  if (previous?.root_folder_id && /^[A-Za-z0-9_-]{10,200}$/.test(previous.root_folder_id)) {
    try {
      const res = await driveFetch(tokens.access_token, `${DRIVE}/files/${previous.root_folder_id}?fields=id,trashed`);
      const f = (await res.json()) as { id?: string; trashed?: boolean };
      if (f.id && !f.trashed) folderId = f.id;
    } catch {
      // Different account, or the folder was deleted: make a new one.
    }
  }
  if (!folderId) {
    const folder = await driveFetch(tokens.access_token, `${DRIVE}/files?fields=id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", appProperties: { bfft: "root" } }),
    });
    folderId = ((await folder.json()) as { id: string }).id;
  }

  const email = emailFromIdToken(tokens.id_token);
  const { error } = await db.from("drive_connection").upsert({
    id: 1,
    refresh_token_enc: encryptToken(tokens.refresh_token, cfg.key),
    google_email: email,
    root_folder_id: folderId,
    connected_by: adminId,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new DriveError("Couldn't save the Drive connection.", 500);
  cached = null;
  return { email };
}

/** Forget the connection and revoke Google's permission. */
export async function disconnect(): Promise<void> {
  const cfg = driveConfig();
  const db = createServiceClient();
  const { data } = await db.from("drive_connection").select("refresh_token_enc").eq("id", 1).maybeSingle();
  if (data && cfg) {
    try {
      const token = decryptToken(data.refresh_token_enc, cfg.key);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: timeout(10_000) });
    } catch {
      // Best effort: the row is removed either way.
    }
  }
  await db.from("drive_connection").delete().eq("id", 1);
  cached = null;
}

// ── Access ──────────────────────────────────────────────────────────────────

type Connection = { token: string; expires: number; folderId: string; stored: string };
let cached: Connection | null = null;

async function connection(): Promise<Connection> {
  const cfg = driveConfig();
  if (!cfg) throw new DriveError("Google Drive isn't set up yet.", 503);
  const db = createServiceClient();
  const { data, error } = await db.from("drive_connection").select("refresh_token_enc, root_folder_id").eq("id", 1).maybeSingle();
  if (error || !data) throw new DriveError("Google Drive isn't connected yet. An admin can connect it on the admin page.", 503, true);
  if (cached && cached.stored === data.refresh_token_enc && cached.expires > Date.now() + 60_000) return cached;
  const tokens = await tokenRequest({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: decryptToken(data.refresh_token_enc, cfg.key),
    grant_type: "refresh_token",
  });
  cached = { token: tokens.access_token, expires: Date.now() + tokens.expires_in * 1000, folderId: data.root_folder_id, stored: data.refresh_token_enc };
  return cached;
}

async function driveFetch(token: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(rest.headers as Record<string, string>), authorization: `Bearer ${token}` },
    signal: timeout(timeoutMs),
    cache: "no-store",
  });
  if (res.status === 401) {
    cached = null;
    throw new DriveError("Google Drive access expired. Please try again.", 503);
  }
  if (!res.ok && res.status !== 308) throw new DriveError(`Google Drive returned ${res.status}.`, res.status === 404 ? 404 : 502);
  return res;
}

/** Cheap check for pages: is Drive set up and connected? (Doesn't call Google.) */
export async function driveReady(): Promise<boolean> {
  if (!driveConfig()) return false;
  try {
    const { data } = await createServiceClient().from("drive_connection").select("id").eq("id", 1).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export type DriveStatus =
  | { state: "not-configured" }
  | { state: "not-connected" }
  | { state: "connected"; email: string | null; connectedAt: string }
  | { state: "broken"; email: string | null; connectedAt: string; message: string };

/** For the admin page: is Drive set up, connected and working? */
export async function driveStatus(): Promise<DriveStatus> {
  if (!driveConfig()) return { state: "not-configured" };
  const db = createServiceClient();
  const { data } = await db.from("drive_connection").select("google_email, connected_at").eq("id", 1).maybeSingle();
  if (!data) return { state: "not-connected" };
  try {
    await connection();
    return { state: "connected", email: data.google_email, connectedAt: data.connected_at };
  } catch (e) {
    return { state: "broken", email: data.google_email, connectedAt: data.connected_at, message: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Files ───────────────────────────────────────────────────────────────────

/** Start a resumable upload into the family folder; returns the session URL (server-only). */
export async function startUpload(opts: { name: string; mime: string; bytes: number; appProperties: Record<string, string> }): Promise<string> {
  const c = await connection();
  const res = await driveFetch(c.token, `${UPLOAD}?uploadType=resumable&fields=id,size`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": opts.mime,
      "x-upload-content-length": String(opts.bytes),
    },
    body: JSON.stringify({ name: opts.name, mimeType: opts.mime, parents: [c.folderId], appProperties: opts.appProperties }),
  });
  const location = res.headers.get("location");
  if (!location || !location.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
    throw new DriveError("Google Drive didn't start the upload.");
  }
  return location;
}

export type ChunkResult = { done: false; received: number } | { done: true; fileId: string; size: number };

/** Send one chunk of a resumable upload. */
export async function sendChunk(sessionUrl: string, chunk: Uint8Array<ArrayBuffer>, start: number, total: number): Promise<ChunkResult> {
  if (!sessionUrl.startsWith("https://www.googleapis.com/upload/drive/v3/files")) throw new DriveError("Bad upload session.", 400);
  const end = start + chunk.byteLength - 1;
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "content-range": `bytes ${start}-${end}/${total}` },
    body: chunk,
    signal: timeout(60_000),
    cache: "no-store",
  });
  if (res.status === 308) {
    const range = res.headers.get("range");
    const m = range ? /bytes=0-(\d+)/.exec(range) : null;
    return { done: false, received: m ? Number(m[1]) + 1 : 0 };
  }
  if (res.ok) {
    const json = (await res.json()) as { id?: string; size?: string };
    if (!json.id) throw new DriveError("Google Drive didn't return the file.");
    return { done: true, fileId: json.id, size: Number(json.size ?? total) };
  }
  if (res.status === 404 || res.status === 410) throw new DriveError("The upload expired. Please try again.", 410);
  throw new DriveError(`Google Drive returned ${res.status} during the upload.`);
}

/** Download a file's bytes (streamed). */
export async function downloadFile(fileId: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new DriveError("Bad file id.", 400);
  const c = await connection();
  return driveFetch(c.token, `${DRIVE}/files/${fileId}?alt=media`, { timeoutMs: 30_000 });
}

/** Remove a file the site created (e.g. an abandoned upload). Best effort. */
export async function trashFile(fileId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return;
  try {
    const c = await connection();
    await driveFetch(c.token, `${DRIVE}/files/${fileId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  } catch {
    // Leaving an unused file in the folder is harmless.
  }
}
