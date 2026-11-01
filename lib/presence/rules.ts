// Pure helpers for the admin "Live" view (who is on the site right now).
// Shared by the heartbeat route, the store and the admin page; no I/O here.

/** A member counts as "here now" if their last heartbeat is this recent. */
export const LIVE_WINDOW_MS = 5 * 60 * 1000;

/** How often an open, visible tab says "still here". */
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** How often the admin Live view refreshes. */
export const LIVE_POLL_MS = 15 * 1000;

const MAX_PATH_LENGTH = 200;
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/%]*$/;

/**
 * The page a heartbeat reports, reduced to a bare pathname: no query string or
 * hash (they can carry search terms), and only plain path characters. Anything
 * else is dropped rather than stored.
 */
export function cleanPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const path = input.split(/[?#]/)[0];
  if (!path || path.length > MAX_PATH_LENGTH || path.startsWith("//")) return null;
  return SAFE_PATH.test(path) ? path : null;
}

type T = (en: string, ar: string) => string;

/** A friendly name for a page ("Family tree", "A profile"), for the Live list. */
export function pageLabel(path: string | null, t: T): string {
  if (!path) return t("Unknown page", "صفحة غير معروفة");
  if (path === "/") return t("Family tree", "شجرة العائلة");
  if (path === "/people") return t("People", "الأشخاص");
  if (path === "/relationships") return t("Relationships", "صلات القرابة");
  if (path === "/person/new") return t("Adding a person", "إضافة شخص");
  if (/^\/person\/[^/]+\/edit$/.test(path)) return t("Editing a profile", "تعديل ملف شخصي");
  if (/^\/person\/[^/]+\/event\/new$/.test(path)) return t("Adding a memory", "إضافة ذكرى");
  if (/^\/person\/[^/]+$/.test(path)) return t("Viewing a profile", "يشاهد ملفًا شخصيًا");
  if (path.startsWith("/account")) return t("Their account", "حسابه");
  if (path.startsWith("/admin")) return t("Admin", "الإدارة");
  return path;
}

/** "just now", "2 min ago" (for a last-seen time, at most a few minutes old). */
export function agoLabel(lastSeen: number, now: number, t: T): string {
  const seconds = Math.max(0, Math.round((now - lastSeen) / 1000));
  if (seconds < 45) return t("just now", "الآن");
  const minutes = Math.max(1, Math.round(seconds / 60));
  return t(`${minutes} min ago`, `قبل ${minutes} د`);
}
