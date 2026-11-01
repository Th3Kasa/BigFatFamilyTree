import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLang } from "@/lib/lang/server";
import { getAdminContext } from "@/lib/members/auth";
import { LiveMembers } from "@/components/admin/LiveMembers";
import { displayFont } from "@/components/members/primitives";

export const metadata: Metadata = { title: "Live" };
export const dynamic = "force-dynamic";

export default async function AdminLivePage() {
  const [ctx, lang] = await Promise.all([getAdminContext(), getLang()]);
  if (!ctx) redirect("/");
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <div className="flex flex-col gap-5 text-[#241517]">
      <div>
        <h1 className="text-[30px] font-bold leading-tight" style={displayFont(lang)}>
          {t("Live", "الآن")}
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--muted-foreground)]">
          {t(
            "Signed-in members on the site in the last 5 minutes. Only admins can see this, and nothing is kept for longer than that.",
            "الأعضاء المسجّلون على الموقع خلال آخر 5 دقائق. لا يرى هذا إلا المشرفون، ولا يُحفظ شيء لأكثر من ذلك.",
          )}
        </p>
      </div>
      <LiveMembers lang={lang} />
    </div>
  );
}
