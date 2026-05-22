import Link from "next/link";
import Image from "next/image";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { UserMenu } from "@/components/shell/UserMenu";
import { CommandTriggerClient } from "@/components/shell/CommandTriggerClient";
import type { Lang } from "@/lib/lang/server";
import type { User } from "@supabase/supabase-js";

interface TopBarProps {
  user: User | null;
  lang: Lang;
  role?: string;
}

export function TopBar({ user, lang, role }: TopBarProps) {
  return (
    <header className="glass-1 sticky top-0 z-40 col-span-2 flex h-14 items-center gap-3 border-b border-[var(--border)] px-4">
      <Link
        href="/"
        className="group flex items-center gap-2.5 text-sm font-semibold text-[var(--foreground)] transition-opacity hover:opacity-90"
      >
        <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full shadow-[var(--shadow-floating)] ring-1 ring-[var(--border)] transition-transform duration-300 ease-out group-hover:-rotate-3 group-hover:scale-105">
          <Image
            src="/logo-mark.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full"
            priority
          />
        </span>
        <span
          className="tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Big Fat Family
        </span>
      </Link>

      <div className="hidden items-center gap-2 text-[var(--muted-foreground)] sm:flex">
        <span aria-hidden className="text-[var(--border)]">/</span>
        <Breadcrumb />
      </div>

      <div className="flex-1" />

      <CommandTriggerClient />

      {user && <UserMenu user={user} role={role} />}
    </header>
  );
}
