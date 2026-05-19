"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Mic, Shield, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Canvas", icon: Home },
  { href: "/transcripts", label: "Transcripts", icon: Mic },
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "#more", label: "More", icon: MoreHorizontal },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-[var(--border)] bg-[var(--surface-2)] backdrop-blur-sm safe-area-bottom">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
              isActive
                ? "text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
