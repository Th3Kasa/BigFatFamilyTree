// Same-origin guard for post-auth `?next=` destinations.
//
// A prefix check ("starts with / but not // or /\") is not enough: URL parsers
// strip ASCII tab/CR/LF anywhere in a URL and treat "\" like "/", so
// "/\t/evil.com" (sent as ?next=/%09/evil.com) passes the prefix check and then
// resolves to https://evil.com. We reject control characters, whitespace and
// backslashes outright, then confirm the value resolves to our own origin.

const BASE = "http://same-origin.invalid";

export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  if (/[\u0000-\u001F\u007F\\\s]/u.test(raw)) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
