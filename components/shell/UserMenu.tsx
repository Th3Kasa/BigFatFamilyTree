"use client";

import { useRef } from "react";
import Link from "next/link";
import { LogOut, Shield } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { avatarTone } from "@/lib/people/display";
import type { Lang } from "@/lib/lang/server";

interface UserMenuProps {
  user: SupabaseUser;
  role?: string;
  lang: Lang;
  /** "avatar" for the top bar, "tab" for the mobile bottom bar's "Me" tab. */
  variant?: "avatar" | "tab";
  active?: boolean;
}

const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  admin: { en: "Admin", ar: "مشرف" },
  editor: { en: "Editor", ar: "محرّر" },
  viewer: { en: "Family member", ar: "فرد من العائلة" },
};

function userInitials(user: SupabaseUser) {
  const name = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined);
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((Array.from(parts[0] ?? "")[0] ?? "") + (Array.from(parts[1] ?? "")[0] ?? "")).toUpperCase() || "?";
  }
  return (user.email ?? "?").slice(0, 2).toUpperCase();
}

function UserAvatar({ user, size }: { user: SupabaseUser; size: "sm" | "md" }) {
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const tone = avatarTone(user.id);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        size === "md" ? "h-10 w-10 text-sm ring-2 ring-white shadow-[0_0_0_3px_var(--border-strong)]" : "h-6 w-6 text-[9px]",
      )}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider avatar URL of unknown size
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{userInitials(user)}</span>
      )}
    </span>
  );
}

export function UserMenu({ user, role, lang, variant = "avatar", active = false }: UserMenuProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const signOutRef = useRef<HTMLFormElement>(null);
  const roleLabel = role ? (lang === "ar" ? ROLE_LABELS[role]?.ar : ROLE_LABELS[role]?.en) ?? role : null;

  return (
    <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
      <DropdownMenuTrigger asChild>
        {variant === "avatar" ? (
          <button
            type="button"
            aria-label={t("Your account", "حسابك")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <UserAvatar user={user} size="md" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("Me: your account", "أنا: حسابك")}
            className={cn(
              "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
            )}
          >
            <UserAvatar user={user} size="sm" />
            <span aria-hidden>{t("Me", "أنا")}</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={variant === "tab" ? "top" : "bottom"} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3 py-1">
            <UserAvatar user={user} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">{user.email}</p>
              {roleLabel && <p className="text-xs text-[var(--muted-foreground)]">{roleLabel}</p>}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {role === "admin" && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield />
                {t("Admin dashboard", "لوحة الإشراف")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={() => signOutRef.current?.requestSubmit()}
          className="text-[var(--destructive)] focus:text-[var(--destructive)]"
        >
          <LogOut className="h-4 w-4" />
          {t("Sign out", "تسجيل الخروج")}
        </DropdownMenuItem>
      </DropdownMenuContent>
      <form ref={signOutRef} action="/auth/signout" method="post" hidden />
    </DropdownMenu>
  );
}
