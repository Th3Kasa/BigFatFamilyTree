import { cn } from "@/lib/utils";

/** Soft pulsing placeholder block used by the loading screens. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-full bg-[var(--muted)]", className)} />;
}

/** Wrapper that announces loading once to screen readers. */
export function LoadingRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
