import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLang } from "@/lib/lang/server";
import { getAdminContext } from "@/lib/members/auth";
import { loadMembersAdminData } from "@/lib/members/admin-data";
import { MembersAdmin } from "@/components/members/MembersAdmin";
import { cardClass, displayFont } from "@/components/members/primitives";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const [ctx, lang] = await Promise.all([getAdminContext(), getLang()]);
  if (!ctx) redirect("/");

  const data = await loadMembersAdminData(ctx.supabase);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  // Raw database errors are for developers only; production shows a plain message.
  const showRawError = process.env.NODE_ENV === "development";
  if (data.loadError) console.error("[admin/members] load failed:", data.loadError);

  return (
    <div className="flex flex-col gap-5 text-[#241517]">
      <div>
        <h1 className="text-[30px] font-bold leading-tight" style={displayFont(lang)}>
          {t("Members", "الأعضاء")}
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--muted-foreground)]">
          {t(
            "Everyone with an account. Link each person to their place in the tree so the site knows who \"you\" is.",
            "كل من لديه حساب. اربط كل شخص بمكانه في الشجرة ليعرف الموقع من هو «أنت».",
          )}
        </p>
      </div>

      {data.loadError ? (
        <div role="alert" className={`${cardClass} border-[#F6D3BC] bg-[#FFF4EC] p-4 text-sm text-[#9A3412]`}>
          <p className="font-bold">{t("Couldn't load the member lists.", "تعذّر تحميل قوائم الأعضاء.")}</p>
          {showRawError ? (
            <p className="mt-1">
              {t(
                "The member-accounts database migrations may not be applied yet.",
                "ربما لم يتم تطبيق ترحيلات قاعدة البيانات الخاصة بالأعضاء بعد.",
              )}{" "}
              <span className="font-mono text-xs">{data.loadError}</span>
            </p>
          ) : (
            <p className="mt-1">
              {t(
                "Please refresh the page. If this keeps happening, contact the site maintainer.",
                "يرجى تحديث الصفحة. إذا تكرر ذلك، تواصل مع مسؤول الموقع.",
              )}
            </p>
          )}
        </div>
      ) : (
        <MembersAdmin
          lang={lang}
          data={data}
          currentUserId={ctx.userId}
          isSuperAdmin={ctx.isSuperAdmin}
          initialTab={data.pending.length + data.waitingAccess.length > 0 ? "waiting" : data.suggestions.length > 0 ? "suggestions" : "all"}
        />
      )}
    </div>
  );
}
