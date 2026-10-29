import type { Lang } from "@/lib/lang/server";

/**
 * Persist the interface language in the same `lang` cookie the server reads
 * (lib/lang/server.ts), then reload so the root layout re-renders with the
 * new `lang` / `dir` attributes.
 */
export function setLangCookie(next: Lang) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

export function switchLanguage(next: Lang) {
  setLangCookie(next);
  window.location.reload();
}
