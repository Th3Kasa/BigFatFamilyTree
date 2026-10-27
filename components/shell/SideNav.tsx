"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Clock, Network, UserCheck, Users, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/lang/server";

export type NavKey = "tree" | "people" | "relationships" | "members";

/** Which main section a path belongs to (profiles live under People). */
export function activeSection(pathname: string): NavKey | null {
  if (pathname === "/") return "tree";
  if (pathname.startsWith("/people") || pathname.startsWith("/person")) return "people";
  if (pathname.startsWith("/relationships")) return "relationships";
  if (pathname.startsWith("/admin/members")) return "members";
  return null;
}

type Props = {
  lang: Lang;
  isAdmin: boolean;
  /**
   * Members waiting for an admin (e.g. sign-ups to approve). Shown as a badge on
   * "Members" when greater than zero. Supplied by the members feature.
   */
  membersBadge?: number;
};

export function SideNav({ lang, isAdmin, membersBadge = 0 }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = activeSection(pathname);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const recentActive = pathname === "/people" && searchParams.get("sort") === "recent";

  const items: { key: NavKey; href: string; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "tree", href: "/", label: t("Family tree", "شجرة العائلة"), icon: <Network className="h-5 w-5" aria-hidden /> },
    { key: "people", href: "/people", label: t("People", "الأشخاص"), icon: <Users className="h-5 w-5" aria-hidden /> },
    {
      key: "relationships",
      href: "/relationships",
      label: t("Relationships", "صلات القرابة"),
      icon: <Waypoints className="h-5 w-5" aria-hidden />,
    },
  ];
  if (isAdmin) {
    items.push({
      key: "members",
      href: "/admin/members",
      label: t("Members", "الأعضاء"),
      icon: <UserCheck className="h-5 w-5" aria-hidden />,
      badge: membersBadge,
    });
  }

  return (
    <nav
      aria-label={t("Main", "القائمة الرئيسية")}
      className="sticky top-[var(--topbar-h)] hidden h-[calc(100svh-var(--topbar-h))] w-[236px] shrink-0 flex-col gap-1 overflow-y-auto border-e border-[var(--border)] bg-[var(--card)] px-3 py-4 md:flex"
    >
      {items.map((item) => {
        const current = section === item.key && !(item.key === "people" && recentActive);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              current
                ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                : "font-medium text-[var(--foreground)] hover:bg-[var(--muted)]",
            )}
          >
            {item.icon}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-xs font-bold text-[var(--primary-foreground)]">
                {item.badge > 99 ? "99+" : item.badge}
                <span className="sr-only">{t(" waiting", " بانتظار المراجعة")}</span>
              </span>
            ) : null}
          </Link>
        );
      })}

      <div aria-hidden className="mx-1 my-3 h-px bg-[var(--border)]" />
      <p id="shortcuts-heading" className="mx-3 mb-1.5 mt-1 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--muted-foreground)]">
        {t("Your shortcuts", "اختصاراتك")}
      </p>
      <ul aria-labelledby="shortcuts-heading" className="flex flex-col gap-1">
        <li>
          <Link
            href="/people?sort=recent"
            aria-current={recentActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              recentActive
                ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                : "text-[var(--foreground)] hover:bg-[var(--muted)]",
            )}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
              <Clock className="h-3.5 w-3.5" aria-hidden />
            </span>
            {t("Recently added", "أضيف مؤخرًا")}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
