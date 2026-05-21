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

export function Breadcrumb({ className, lang = "en" }: { className?: string; lang?: "ar" | "en" }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = [
    { label: "Family", href: "/" },
    ...segments.reduce<{ label: string; href: string }[]>((acc, seg, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/");
      const prev = segments[i - 1];
      if (UUID_RE.test(seg) || prev === "person") {
        // Hide UUIDs and slugs under /person/ — attach href to the previous crumb
        if (acc.length > 0) acc[acc.length - 1].href = href;
        return acc;
      }
      const label =
        seg === "person"
          ? (lang === "ar" ? "شخص" : "Person")
          : (segmentLabels[seg] ?? seg);
      acc.push({ label, href });
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
