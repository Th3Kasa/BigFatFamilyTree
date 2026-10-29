import Image from "next/image";
import { LanguageToggle } from "@/components/shell/LanguageToggle";
import type { Lang } from "@/lib/lang/server";

/**
 * Slim header for signed-in accounts that are still waiting for access. They
 * don't get the app shell (its links would all bounce back here), just the
 * brand, the language switch and a way to sign out.
 */
export function GateHeader({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-3 sm:px-5">
      <span className="flex items-center gap-2.5">
        <Image src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full" priority />
        <span lang="en" dir="ltr" className="font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight sm:text-[19px]">
          Big Fat Family
        </span>
      </span>
      <div className="ms-auto flex items-center gap-2">
        <LanguageToggle lang={lang} />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-full border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            {t("Sign out", "تسجيل الخروج")}
          </button>
        </form>
      </div>
    </header>
  );
}
