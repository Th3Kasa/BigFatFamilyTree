"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Network, Plus, Search, Waypoints } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { shell, useShell } from "@/lib/client/shell-store";
import { UserMenu } from "@/components/shell/UserMenu";
import { activeSection } from "@/components/shell/SideNav";
import type { Lang } from "@/lib/lang/server";

const tabClass =
  "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** Mobile bottom bar: Tree · Search · (+) · Relationships · Me. Hidden from 768px up. */
export function MobileTabBar({ lang, user, role }: { lang: Lang; user: User; role?: string }) {
  const pathname = usePathname();
  const section = activeSection(pathname);
  const sheetOpen = useShell((s) => s.peopleSheetOpen);
  const addOpen = useShell((s) => s.addOpen);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <nav
      aria-label={t("Main", "القائمة الرئيسية")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[var(--border)] bg-[var(--card)] px-2 pt-1.5 md:hidden"
      style={{ height: "var(--tabbar-h)", paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Link
        href="/"
        aria-current={section === "tree" ? "page" : undefined}
        className={cn(tabClass, section === "tree" && !sheetOpen ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}
      >
        <Network className="h-6 w-6" aria-hidden />
        {t("Tree", "الشجرة")}
      </Link>

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        onClick={() => shell.setPeopleSheetOpen(true)}
        className={cn(tabClass, sheetOpen ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}
      >
        <Search className="h-6 w-6" aria-hidden />
        {t("Search", "بحث")}
      </button>

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={addOpen}
        aria-label={t("Add to the family", "أضف إلى العائلة")}
        onClick={() => shell.openAdd()}
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_6px_16px_rgba(122,22,49,0.35)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <Plus className="h-6 w-6" strokeWidth={2.4} aria-hidden />
      </button>

      <Link
        href="/relationships"
        aria-current={section === "relationships" ? "page" : undefined}
        className={cn(tabClass, section === "relationships" ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}
      >
        <Waypoints className="h-6 w-6" aria-hidden />
        {t("Relations", "القرابة")}
      </Link>

      <UserMenu user={user} role={role} lang={lang} variant="tab" />
    </nav>
  );
}
