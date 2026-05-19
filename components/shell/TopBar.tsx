import Link from "next/link";
import { TreePine } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { UserMenu } from "@/components/shell/UserMenu";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";
import { CommandTriggerClient } from "@/components/shell/CommandTriggerClient";
import type { Lang } from "@/lib/lang/server";
import type { User } from "@supabase/supabase-js";

interface TopBarProps {
  user: User | null;
  lang: Lang;
}

export function TopBar({ user, lang }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 col-span-2 flex h-12 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 backdrop-blur-sm">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
      >
        <TreePine className="h-5 w-5 text-[var(--primary)]" />
        <span className="hidden sm:block">
          {lang === "ar" ? "شجرة العائلة" : "Family Tree"}
        </span>
      </Link>

      <div className="hidden sm:flex items-center gap-1 text-[var(--muted-foreground)]">
        <span className="text-xs">·</span>
        <Breadcrumb />
      </div>

      <div className="flex-1" />

      <CommandTriggerClient />
      <LangToggle current={lang} />
      <ThemeSwitcher />

      {user && <UserMenu user={user} />}
    </header>
  );
}
