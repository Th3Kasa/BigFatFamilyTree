import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Minimal person name shape — accepts any object with the bilingual name
 * fields. Optional everywhere so this works with partial selects.
 */
export type NameablePerson = {
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
};

/**
 * Single source of truth for rendering a person's full display name.
 *
 * Prefers the active language, falls back to the other language per field,
 * and joins given + family with a single space. Returns a sensible
 * "Unnamed" placeholder when nothing is available.
 */
export function getDisplayName(
  p: NameablePerson | null | undefined,
  lang: "ar" | "en" = "en",
): string {
  if (!p) return lang === "ar" ? "بدون اسم" : "Unnamed";
  const given =
    lang === "ar"
      ? (p.given_ar ?? p.given_en)
      : (p.given_en ?? p.given_ar);
  const family =
    lang === "ar"
      ? (p.family_name_ar ?? p.family_name_en)
      : (p.family_name_en ?? p.family_name_ar);
  const full = [given, family].filter(Boolean).join(" ").trim();
  if (full) return full;
  return lang === "ar" ? "بدون اسم" : "Unnamed";
}
