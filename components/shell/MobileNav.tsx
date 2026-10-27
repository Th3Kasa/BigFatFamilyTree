"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Mic, Shield, Search, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "@/components/providers/command-provider";

const navItems: { href: string; label: string; labelAr?: string; icon: typeof Home }[] = [
  { href: "/", label: "Canvas", icon: Home },
  { href: "/transcripts", label: "Transcripts", icon: Mic },
  { href: "/relationships", label: "Relations", labelAr: "القرابة", icon: Waypoints },
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "#search", label: "Search", icon: Search },
];

export function MobileNav({ lang = "en" }: { lang?: "ar" | "en" }) {
  const pathname = usePathname();
  const { openCommand } = useCommandPalette();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-[var(--border)] bg-[var(--surface-2)] backdrop-blur-sm"
      style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {navItems.map(({ href, label: labelEn, labelAr, icon: Icon }) => {
        const label = lang === "ar" && labelAr ? labelAr : labelEn;
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        if (href.startsWith("#")) {
          return (
            <button
              key={href}
              type="button"
              onClick={openCommand}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          );
        }
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
