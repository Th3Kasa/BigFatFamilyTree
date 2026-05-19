export function generateSlug(givenEn?: string | null, familyNameEn?: string | null, givenAr?: string | null): string {
  const base = [givenEn, familyNameEn].filter(Boolean).join(" ").trim()
    || givenAr?.trim()
    || "person";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
