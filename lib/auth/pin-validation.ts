// Pure (client- and server-safe) rules for PIN sign-in: names, birthday, PINs,
// the name key used to look an account up, and every user-facing message.
// Zod issues carry a CODE as their message; pinMessage() turns a code into
// plain EN/AR text so the same rules produce the same wording everywhere.

import { z } from "zod";
import { isRealIsoDate, MIN_DOB, todayIso } from "@/lib/validation/members";

export type Lang = "ar" | "en";

export const PIN_MESSAGES = {
  name_invalid: [
    "Use 1 to 60 letters for each name (spaces, hyphens and apostrophes are fine).",
    "استخدم من ١ إلى ٦٠ حرفًا لكل اسم (المسافات والشرطة والفاصلة العليا مسموحة).",
  ],
  dob_invalid: ["Enter a valid date of birth.", "أدخل تاريخ ميلاد صحيحًا."],
  dob_future: ["Date of birth can't be in the future.", "لا يمكن أن يكون تاريخ الميلاد في المستقبل."],
  pin_format: ["Your PIN is exactly 4 digits.", "رمزك السري مكوّن من ٤ أرقام بالضبط."],
  pin_trivial: [
    "That PIN is too easy to guess (like 1234 or 1111). Pick another.",
    "هذا الرمز سهل التخمين (مثل 1234 أو 1111). اختر رمزًا آخر.",
  ],
  pin_mismatch: ["The two PINs don't match.", "الرمزان غير متطابقين."],
  family_pin_format: ["The family PIN is 6 digits.", "رمز العائلة مكوّن من ٦ أرقام."],
  family_pin_wrong: [
    "That family PIN isn't right. Ask in the family group.",
    "رمز العائلة غير صحيح. اسأل في مجموعة العائلة.",
  ],
  duplicate: [
    "Someone with this name and birthday already has an account. Try signing in, or ask an admin.",
    "يوجد حساب بهذا الاسم وتاريخ الميلاد بالفعل. جرّب تسجيل الدخول أو اسأل المشرف.",
  ],
  generic_signin: [
    "Those details don't match. Check your name, birthday and PIN.",
    "البيانات غير متطابقة. تحقق من اسمك وتاريخ ميلادك ورمزك السري.",
  ],
  locked: [
    "Too many tries — wait 15 minutes or ask an admin to reset your PIN",
    "محاولات كثيرة — انتظر ١٥ دقيقة أو اطلب من المشرف إعادة تعيين رمزك السري",
  ],
  locked_day: [
    "Too many tries today — ask a family admin to reset your PIN, or try again tomorrow",
    "محاولات كثيرة اليوم — اطلب من مشرف العائلة إعادة تعيين رمزك السري، أو حاول غدًا",
  ],
  busy: ["Please try again shortly.", "يرجى المحاولة مرة أخرى بعد قليل."],
  too_many_ip: [
    "Too many attempts from this connection. Please try again later.",
    "محاولات كثيرة من هذا الاتصال. حاول لاحقًا.",
  ],
  failed: ["Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."],
  not_signed_in: ["Please sign in first.", "يرجى تسجيل الدخول أولًا."],
  old_pin_wrong: ["Your current PIN isn't right.", "رمزك الحالي غير صحيح."],
  same_pin: ["Choose a different PIN from your current one.", "اختر رمزًا مختلفًا عن رمزك الحالي."],
} as const satisfies Record<string, readonly [string, string]>;

export type PinMessageCode = keyof typeof PIN_MESSAGES;

export function pinMessage(code: string, lang: Lang): string {
  const entry = (PIN_MESSAGES as Record<string, readonly [string, string]>)[code] ?? PIN_MESSAGES.failed;
  return lang === "ar" ? entry[1] : entry[0];
}

/** The code of the first problem in a zod error (falls back to "failed"). */
export function firstIssueCode(error: z.ZodError): PinMessageCode {
  const code = error.issues[0]?.message;
  return code && code in PIN_MESSAGES ? (code as PinMessageCode) : "failed";
}

// ── digits ──────────────────────────────────────────────────────────────────

/** Arabic-Indic and Persian digits → 0-9, then drop spaces. People type PINs on Arabic keyboards. */
export function normaliseDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, "");
}

// ── trivial PINs ────────────────────────────────────────────────────────────

const COMMON_PINS: ReadonlySet<string> = new Set(["2580", "0852", "1357", "2468", "1379", "1004", "2000", "1122", "6969", "1010"]);

/** 0000/1111, 1234/4321/3456, 1212/2121, 1122/9900 and a few famous ones. */
export function isTrivialPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  const d = pin.split("").map(Number);
  if (d.every((x) => x === d[0])) return true;
  const steps = [d[1] - d[0], d[2] - d[1], d[3] - d[2]];
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true;
  if (d[0] === d[2] && d[1] === d[3]) return true; // abab
  if (d[0] === d[1] && d[2] === d[3]) return true; // aabb
  return COMMON_PINS.has(pin);
}

// ── name key ────────────────────────────────────────────────────────────────

/**
 * Lower-case, Arabic-aware name normalisation. Mirrors public._claim_norm():
 * alef/ya/ta-marbuta variants folded, diacritics and tatweel dropped,
 * punctuation (hyphens, apostrophes) turned into spaces, whitespace collapsed.
 */
export function normaliseName(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627") // alef variants -> alef
    .replace(/\u0649/g, "\u064A") // alef maksura -> ya
    .replace(/\u0629/g, "\u0647") // ta marbuta -> ha
    .replace(/[\u064B-\u0670\u065F\u0640]/g, "") // diacritics and tatweel
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The lookup key stored in profiles.name_key. */
export function makeNameKey(firstName: string, lastName: string): string {
  return normaliseName(`${firstName} ${lastName}`);
}

// ── schemas ─────────────────────────────────────────────────────────────────

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u;

export const pinNameSchema = z
  .string()
  .transform((v) => v.normalize("NFKC").replace(/\s+/g, " ").trim())
  .refine((v) => v.length >= 1 && v.length <= 60 && NAME_RE.test(v) && makeNameKey(v, "x").length > 1, "name_invalid");

export const pinDobSchema = z
  .string()
  .trim()
  .refine((v) => isRealIsoDate(v) && v >= MIN_DOB, "dob_invalid")
  .refine((v) => v <= todayIso(), "dob_future");

const digitsPreprocess = (v: unknown) => (typeof v === "string" ? normaliseDigits(v) : v);

/** A new PIN: 4 digits, not trivial. */
export const newPinSchema = z.preprocess(
  digitsPreprocess,
  z
    .string()
    .regex(/^\d{4}$/, "pin_format")
    .refine((v) => !isTrivialPin(v), "pin_trivial"),
);

/** An existing PIN being typed to sign in: format only (never reveal the trivial-PIN rule at sign-in). */
export const pinSchema = z.preprocess(digitsPreprocess, z.string().regex(/^\d{4}$/, "pin_format"));

export const familyPinSchema = z.preprocess(digitsPreprocess, z.string().regex(/^\d{6}$/, "family_pin_format"));

export const pinSignInSchema = z.object({
  firstName: pinNameSchema,
  lastName: pinNameSchema,
  dateOfBirth: pinDobSchema,
  pin: pinSchema,
});
export type PinSignInInput = z.input<typeof pinSignInSchema>;

export const pinJoinSchema = z
  .object({
    firstName: pinNameSchema,
    lastName: pinNameSchema,
    dateOfBirth: pinDobSchema,
    familyPin: familyPinSchema,
    pin: newPinSchema,
    pinConfirm: z.preprocess(digitsPreprocess, z.string()),
  })
  .refine((v) => v.pin === v.pinConfirm, { path: ["pinConfirm"], message: "pin_mismatch" });
export type PinJoinInput = z.input<typeof pinJoinSchema>;

export const changePinSchema = z
  .object({
    oldPin: pinSchema,
    newPin: newPinSchema,
    newPinConfirm: z.preprocess(digitsPreprocess, z.string()),
  })
  .refine((v) => v.newPin === v.newPinConfirm, { path: ["newPinConfirm"], message: "pin_mismatch" })
  .refine((v) => v.newPin !== v.oldPin, { path: ["newPin"], message: "same_pin" });
export type ChangePinInput = z.input<typeof changePinSchema>;

// ── duplicate-account rule ──────────────────────────────────────────────────

/** Name of the unique index behind "one PIN account per name + birthday". */
export const PIN_IDENTITY_INDEX = "profiles_pin_identity_uidx";

/** Did Postgres refuse an insert because that name + birthday already has a PIN account? */
export function isDuplicateIdentityError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    msg.includes(PIN_IDENTITY_INDEX) ||
    // GoTrue wraps trigger failures as "Database error creating new user".
    (error.code === "23505" && /profiles/.test(msg))
  );
}
