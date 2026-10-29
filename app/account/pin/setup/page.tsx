import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLang } from "@/lib/lang/server";
import { createClient } from "@/lib/supabase/server";
import { SetUpPinForm } from "@/components/auth/SetUpPinForm";
import { cardClass, displayFont, pill } from "@/components/members/primitives";
import {
  canSetUpPin,
  hasRecentEmailLinkSignIn,
  isFreshSignIn,
  RECOVER_LINK_WINDOW_MS,
  SETUP_FRESH_SESSION_MS,
  splitName,
  type AmrEntry,
} from "@/lib/auth/pin-setup";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in with a PIN" };
export const dynamic = "force-dynamic";

export default async function SetUpPinPage() {
  const lang = await getLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/pin/setup");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, login_method, first_name, last_name, full_name, display_name, date_of_birth")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/");

  const verdict = canSetUpPin({
    sessionUserId: user.id,
    targetId: profile.id,
    loginMethod: profile.login_method,
    email: user.email,
  });
  if (!verdict.ok) redirect("/");
  const mode = verdict.mode;

  // The same checks the server action repeats; here they only decide what to show.
  const now = Date.now();
  let allowed: boolean;
  if (mode === "convert") {
    allowed = isFreshSignIn(user.last_sign_in_at, now, SETUP_FRESH_SESSION_MS);
  } else {
    const { data } = await supabase.auth.getClaims();
    const amr = (data?.claims as { amr?: AmrEntry[] } | undefined)?.amr;
    allowed = hasRecentEmailLinkSignIn(amr, now, RECOVER_LINK_WINDOW_MS);
  }

  const { firstName, lastName } = splitName(profile);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-5 px-4 py-6 text-[#241517]">
      <div>
        <h1 className="text-[28px] font-bold leading-tight" style={displayFont(lang)}>
          {mode === "convert" ? t("Sign in with a PIN", "الدخول برمز سري") : t("Set a new PIN", "تعيين رمز سري جديد")}
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--muted-foreground)]">
          {mode === "convert"
            ? t(
                "Skip the email and password. Choose a 4-digit PIN that only you know.",
                "تخطَّ البريد وكلمة المرور. اختر رمزًا من ٤ أرقام لا يعرفه غيرك.",
              )
            : t(
                "You signed in with an email link, so you can choose a new PIN without the old one.",
                "دخلت برابط البريد، لذا يمكنك اختيار رمز جديد دون القديم.",
              )}
        </p>
      </div>
      <div className={`${cardClass} p-5`}>
        {allowed ? (
          <SetUpPinForm lang={lang} mode={mode} initial={{ firstName, lastName, dob: profile.date_of_birth ?? "" }} />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {mode === "convert"
                ? t(
                    "For your safety, please sign out and sign in again with an email link, then come back here.",
                    "لأمانك، سجّل الخروج ثم ادخل مجددًا برابط البريد، ثم عُد إلى هنا.",
                  )
                : t(
                    "To set a new PIN without the old one, sign out, then use \"Admins: sign in with email\" to get a link. Open it, then come back here within 15 minutes.",
                    "لتعيين رمز جديد دون القديم، سجّل الخروج ثم استخدم «للمشرفين: سجّل الدخول بالبريد» للحصول على رابط. افتحه ثم عُد إلى هنا خلال ١٥ دقيقة.",
                  )}
            </p>
            <form action="/auth/signout" method="post">
              <button type="submit" className={cn(pill.primary, "min-h-[52px] w-full text-base")}>
                {t("Sign out", "تسجيل الخروج")}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
