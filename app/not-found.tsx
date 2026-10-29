import Link from "next/link";
import { Network, Users } from "lucide-react";
import { getLang } from "@/lib/lang/server";

export default async function NotFound() {
  const lang = await getLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <div className="flex min-h-[calc(100svh-var(--topbar-h)-var(--tabbar-h))] items-center justify-center p-4">
      <section
        aria-labelledby="not-found-title"
        className="w-full max-w-md rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-[var(--shadow-floating)]"
      >
        <p className="font-heading text-5xl font-bold text-[var(--primary)]" aria-hidden>
          404
        </p>
        <h1 id="not-found-title" className="font-heading mt-3 text-2xl font-bold text-[var(--foreground)]">
          {t("We couldn't find that page", "لم نعثر على هذه الصفحة")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "It may have moved, or the link might be missing a letter. Everyone is still on the tree.",
            "ربما نُقلت الصفحة أو أن الرابط ناقص. الجميع ما زالوا على الشجرة.",
          )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <Network className="h-4 w-4" aria-hidden />
            {t("Back to the family tree", "العودة إلى شجرة العائلة")}
          </Link>
          <Link
            href="/people"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <Users className="h-4 w-4" aria-hidden />
            {t("Browse people", "تصفّح الأشخاص")}
          </Link>
        </div>
      </section>
    </div>
  );
}
