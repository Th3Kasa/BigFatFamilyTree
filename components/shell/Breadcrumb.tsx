"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const segmentLabels: Record<string, string> = {
  "": "Canvas",
  person: "Person",
  new: "New",
  edit: "Edit",
  transcripts: "Transcripts",
  admin: "Admin",
  audit: "Audit",
  login: "Login",
};

export function Breadcrumb({ className }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = [
    { label: "Family", href: "/" },
    ...segments.reduce<{ label: string; href: string }[]>((acc, seg, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/");
      if (UUID_RE.test(seg)) {
        // Attach UUID href to the previous crumb so it stays clickable
        if (acc.length > 0) acc[acc.length - 1].href = href;
        return acc;
      }
      acc.push({ label: segmentLabels[seg] ?? seg, href });
      return acc;
    }, []),
  ];

  if (crumbs.length <= 1) {
    return (
      <span className={cn("text-sm text-[var(--muted-foreground)]", className)}>
        Canvas
      </span>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--muted-foreground)]" />}
          {i < crumbs.length - 1 ? (
            <Link
              href={crumb.href}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-[var(--foreground)] font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
