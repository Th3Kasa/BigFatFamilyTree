// The message the owner pastes into the family WhatsApp group. Pure and client-safe.

export const FAMILY_SITE_URL = "https://www.bigfatfamilytree.com.au";

export function familyInviteMessage(pin: string, lang: "ar" | "en"): string {
  return lang === "ar"
    ? `انضم إلى شجرة عائلتنا: ${FAMILY_SITE_URL} — رمز العائلة: ${pin}`
    : `Join our family tree: ${FAMILY_SITE_URL} — family PIN: ${pin}`;
}
