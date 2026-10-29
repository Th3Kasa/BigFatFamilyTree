import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLang } from "@/lib/lang/server";
import { createClient } from "@/lib/supabase/server";
import { ChangePinForm } from "@/components/auth/ChangePinForm";
import { cardClass, displayFont } from "@/components/members/primitives";

export const metadata: Metadata = { title: "Change my PIN" };
export const dynamic = "force-dynamic";

export default async function ChangePinPage() {
  const lang = await getLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/pin");
  // Only PIN accounts have a PIN (app_metadata can't be edited by the member).
  if (user.app_metadata?.login !== "pin") redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-5 px-4 py-6 text-[#241517]">
      <div>
        <h1 className="text-[28px] font-bold leading-tight" style={displayFont(lang)}>
          {t("Change my PIN", "غيّر رمزي السري")}
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--muted-foreground)]">
          {t(
            "Choose a PIN only you know. You'll use it with your name and birthday to sign in.",
            "اختر رمزًا لا يعرفه غيرك. ستستخدمه مع اسمك وتاريخ ميلادك لتسجيل الدخول.",
          )}
        </p>
      </div>
      <div className={`${cardClass} p-5`}>
        <ChangePinForm lang={lang} />
      </div>
    </div>
  );
}
