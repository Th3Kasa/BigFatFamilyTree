import Link from "next/link";
import { Home, Mic, Shield } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NavRailActiveItem } from "@/components/shell/NavRailActiveItem";
import type { Lang } from "@/lib/lang/server";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Canvas", icon: <Home className="h-5 w-5" /> },
  { href: "/transcripts", label: "Transcripts", icon: <Mic className="h-5 w-5" /> },
  { href: "/admin", label: "Admin", icon: <Shield className="h-5 w-5" />, adminOnly: true },
];

interface NavRailProps {
  lang?: Lang;
  role?: string;
}

export function NavRail({ role }: NavRailProps) {
  const isAdmin = role === "admin" || role === "owner";

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="hidden md:flex flex-col items-center gap-1 py-3 px-1 border-e border-[var(--border)] w-14 bg-[var(--background)]">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <NavRailActiveItem href={item.href} label={item.label}>
                  {item.icon}
                </NavRailActiveItem>
              </TooltipTrigger>
              <TooltipContent side="right">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
      </nav>
    </TooltipProvider>
  );
}
