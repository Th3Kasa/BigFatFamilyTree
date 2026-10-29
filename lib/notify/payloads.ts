// Pure builders for the (optional) notification emails: subject + branded HTML
// + plain text. No I/O here so the content is unit-testable; lib/notify/email.ts
// does the sending.

export const SITE_URL = "https://www.bigfatfamilytree.com.au";
export const EMAIL_FROM = "Big Fat Family <noreply@bigfatfamilytree.com.au>";
const BRAND = "#7A1631";

export type EmailPayload = { subject: string; html: string; text: string };
export type Lang = "ar" | "en";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only ever link to our own site (or a path on it). */
export function siteLink(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Strip anything that could break a header or look like markup, and cap the length. */
function plain(s: string | null | undefined, max = 120): string {
  return (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function layout(opts: {
  lang: Lang;
  heading: string;
  paragraphs: string[];
  button?: { label: string; href: string };
}): string {
  const dir = opts.lang === "ar" ? "rtl" : "ltr";
  const paragraphs = opts.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#241517">${escapeHtml(p)}</p>`)
    .join("");
  const button = opts.button
    ? `<p style="margin:22px 0 4px"><a href="${escapeHtml(opts.button.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 26px;border-radius:999px">${escapeHtml(opts.button.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="${opts.lang}" dir="${dir}"><body style="margin:0;padding:24px;background:#FBF7F4;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #ECE2DE;border-radius:20px"><tr><td style="padding:28px"><p style="margin:0 0 18px;font-size:14px;font-weight:700;color:${BRAND}">Big Fat Family</p><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#241517">${escapeHtml(opts.heading)}</h1>${paragraphs}${button}</td></tr></table></td></tr></table></body></html>`;
}

function toText(heading: string, paragraphs: string[], button?: { label: string; href: string }): string {
  return [heading, "", ...paragraphs, ...(button ? ["", `${button.label}: ${button.href}`] : [])].join("\n");
}

/** To every admin: someone asked to be linked / added to the tree. */
export function newRequestEmail(input: { memberName: string; claimedPerson: string | null }): EmailPayload {
  const who = plain(input.memberName) || "Someone";
  const person = plain(input.claimedPerson);
  const heading = "A new family member is waiting";
  const paragraphs = [
    person
      ? `${who} says they are ${person} in the family tree. Please check and let them in.`
      : `${who} signed up and isn't in the tree yet. Please check and let them in.`,
  ];
  const button = { label: "Review in Members", href: siteLink("/admin/members") };
  return {
    subject: `${who} is waiting for access`,
    html: layout({ lang: "en", heading, paragraphs, button }),
    text: toText(heading, paragraphs, button),
  };
}

/** To every admin: a member suggested a relative who isn't on the site yet. */
export function newSuggestionEmail(input: { memberName: string; relativeName: string; relation: string }): EmailPayload {
  const who = plain(input.memberName) || "A member";
  const rel = plain(input.relativeName);
  const relation = plain(input.relation);
  const heading = "A relative was suggested";
  const paragraphs = [`${who} suggested adding ${rel}${relation ? ` (${relation})` : ""} to the family tree.`];
  const button = { label: "Review in Members", href: siteLink("/admin/members") };
  return {
    subject: `${who} suggested a relative: ${rel}`,
    html: layout({ lang: "en", heading, paragraphs, button }),
    text: toText(heading, paragraphs, button),
  };
}

/** To the member: an admin let them in. */
export function approvedEmail(input: { name: string | null; lang?: Lang }): EmailPayload {
  const lang: Lang = input.lang === "ar" ? "ar" : "en";
  const first = plain(input.name).split(" ")[0] ?? "";
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const heading = t("You're in!", "أنت الآن في العائلة!");
  const paragraphs = [
    first
      ? t(`Welcome, ${first}. Come and explore the family tree.`, `أهلًا ${first}. تعال واستكشف شجرة العائلة.`)
      : t("Come and explore the family tree.", "تعال واستكشف شجرة العائلة."),
  ];
  const button = { label: t("Explore the family tree", "استكشف شجرة العائلة"), href: siteLink("/?tour=1") };
  return {
    subject: t("You're in! Come and explore the family tree", "أنت الآن في العائلة! تعال واستكشف الشجرة"),
    html: layout({ lang, heading, paragraphs, button }),
    text: toText(heading, paragraphs, button),
  };
}
