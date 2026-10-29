import { Suspense } from "react";
import type { User } from "@supabase/supabase-js";
import { TopBar } from "@/components/shell/TopBar";
import { SideNav } from "@/components/shell/SideNav";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { AddMenu } from "@/components/shell/AddMenu";
import { PeopleSheet } from "@/components/shell/PeopleSheet";
import { RoleProvider } from "@/components/providers/role-provider";
import { WelcomeTour } from "@/components/onboarding/WelcomeTour";
import type { Lang } from "@/lib/lang/server";

type Props = {
  user: User;
  lang: Lang;
  role?: string;
  /** Badge on "Members" (admins only): people waiting for review. */
  membersBadge?: number;
  children: React.ReactNode;
};

/** Signed-in frame: top bar, labelled side nav (≥768px), bottom tab bar (<768px). */
export function AppShell({ user, lang, role, membersBadge, children }: Props) {
  const isAdmin = role === "admin";
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-[var(--primary)] focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-[var(--primary-foreground)]"
      >
        {lang === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
      </a>
      <TopBar user={user} lang={lang} role={role} />
      <div className="flex min-h-0 flex-1">
        <Suspense fallback={<div aria-hidden className="hidden w-[236px] shrink-0 border-e border-[var(--border)] bg-[var(--card)] md:block" />}>
          <SideNav lang={lang} isAdmin={isAdmin} membersBadge={membersBadge} />
        </Suspense>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-[var(--tabbar-h)] focus:outline-none md:pb-0">
          <RoleProvider role={role}>{children}</RoleProvider>
        </main>
      </div>
      <MobileTabBar lang={lang} user={user} role={role} />
      <AddMenu lang={lang} role={role} />
      <PeopleSheet lang={lang} />
      <Suspense fallback={null}>
        <WelcomeTour lang={lang} />
      </Suspense>
    </div>
  );
}
