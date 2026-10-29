import Link from "next/link";
import Image from "next/image";
import { Waypoints } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { UserMenu } from "@/components/shell/UserMenu";
import { LanguageToggle } from "@/components/shell/LanguageToggle";
import { AddButton } from "@/components/shell/AddButton";
import { SearchBar } from "@/components/ui/search-bar";
import type { Lang } from "@/lib/lang/server";

interface TopBarProps {
  /** null renders the signed-out bar: logo, language and "Sign in". */
  user: User | null;
  lang: Lang;
  role?: string;
}

function Brand({ lang }: { lang: Lang }) {
  return (
    <Link
      href="/"
      aria-label={lang === "ar" ? "Big Fat Family، الصفحة الرئيسية" : "Big Fat Family, home"}
      className="flex shrink-0 items-center gap-2.5 rounded-full text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      <Image src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full" priority />
      <span lang="en" dir="ltr" className="whitespace-nowrap font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight sm:text-[19px]">
        Big Fat Family
      </span>
    </Link>
  );
}

export function TopBar({ user, lang, role }: TopBarProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  if (!user) {
    return (
      <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-3 sm:px-5">
        <Brand lang={lang} />
        <div className="ms-auto flex items-center gap-2">
          <LanguageToggle lang={lang} />
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            {t("Sign in", "تسجيل الدخول")}
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 sm:gap-4 sm:px-5">
      <Brand lang={lang} />

      {/* Desktop search pill; on phones the bottom bar's "Search" tab takes over */}
      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <SearchBar lang={lang} />
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-2 md:ms-0">
        <Link
          href="/relationships"
          aria-label={t("How are we related?", "ما صلة القرابة بيننا؟")}
          className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 xl:w-auto xl:px-4"
        >
          <Waypoints className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="hidden xl:inline">{t("How are we related?", "ما صلة القرابة بيننا؟")}</span>
        </Link>
        <AddButton lang={lang} className="hidden md:inline-flex" />
        <LanguageToggle lang={lang} compact className="sm:hidden" />
        <LanguageToggle lang={lang} className="hidden sm:inline-flex" />
        <div className="hidden md:block">
          <UserMenu user={user} role={role} lang={lang} />
        </div>
      </div>
    </header>
  );
}
