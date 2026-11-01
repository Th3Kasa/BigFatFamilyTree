"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { AuditChange, AuditView } from "@/lib/audit/describe";

export type AuditEntry = {
  id: string;
  /** Already formatted on the server ("Sun 1 Nov 2026, 6:46 pm"). */
  when: string;
  iso: string;
  who: string;
  what: string;
  kind: AuditView["kind"];
  changes: AuditChange[];
  table: string;
  operation: string;
  before: unknown;
  after: unknown;
};

type Props = { entries: AuditEntry[]; page: number; totalPages: number; count: number };

const KIND_STYLE: Record<AuditView["kind"], { label: string; className: string }> = {
  added: { label: "Added", className: "bg-green-50 text-green-800 border-green-200" },
  changed: { label: "Changed", className: "bg-blue-50 text-blue-800 border-blue-200" },
  removed: { label: "Removed", className: "bg-red-50 text-red-800 border-red-200" },
};
const KINDS = ["added", "changed", "removed"] as const;

/**
 * Who did what, and when, in plain words: "Basem Morkos · changed Nassif
 * Mansour's birth date". Tap a row for the field-by-field changes.
 */
export function AuditTable({ entries, page, totalPages, count }: Props) {
  const [kinds, setKinds] = useState<Set<AuditView["kind"]>>(new Set());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => (kinds.size === 0 || kinds.has(e.kind)) && (!q || `${e.who} ${e.what}`.toLowerCase().includes(q)));
  }, [entries, kinds, query]);

  const toggle = (k: AuditView["kind"]) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search by name or action</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, e.g. Basem or Nassif"
            className="h-10 w-full rounded-full border border-border bg-card ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </label>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kinds.has(k)}
            onClick={() => toggle(k)}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              kinds.has(k) ? KIND_STYLE[k].className : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {KIND_STYLE[k].label}
          </button>
        ))}
        {(kinds.size > 0 || query) && (
          <button type="button" onClick={() => { setKinds(new Set()); setQuery(""); }} className="min-h-10 px-2 text-sm text-muted-foreground underline hover:text-foreground">
            Clear
          </button>
        )}
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-amber-50/60">
                  <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">
                    <time dateTime={e.iso}>{e.when}</time>
                  </td>
                  <td className="px-4 py-3 align-top font-semibold text-foreground">{e.who}</td>
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      className="flex w-full flex-wrap items-center gap-2 rounded text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      aria-label={`${e.who} ${e.what}. Show details`}
                    >
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", KIND_STYLE[e.kind].className)}>{KIND_STYLE[e.kind].label}</span>
                      <span className="text-foreground">{e.what}</span>
                      {e.changes.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {e.changes.length === 1 ? `${e.changes[0].from} → ${e.changes[0].to}` : `${e.changes.length} changes`}
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing on this page matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Audit log pages" className="flex flex-wrap items-center gap-2">
          {page > 1 && (
            <a href={`/admin/audit?page=${page - 1}`} className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
              ← Newer
            </a>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <a href={`/admin/audit?page=${page + 1}`} className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
              Older →
            </a>
          )}
          <span className="text-xs text-muted-foreground sm:ms-auto">{count} total entries</span>
        </nav>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader className="mb-5">
                <SheetTitle className="text-lg leading-snug">
                  {selected.who} {selected.what}
                </SheetTitle>
                <SheetDescription>
                  <time dateTime={selected.iso}>{selected.when}</time>
                </SheetDescription>
              </SheetHeader>

              {selected.changes.length > 0 ? (
                <section className="mb-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What changed</h3>
                  <dl className="divide-y divide-border rounded-xl border border-border">
                    {selected.changes.map((c) => (
                      <div key={c.field} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]">
                        <dt className="text-sm font-semibold text-foreground">{c.field}</dt>
                        <dd className="text-sm text-foreground" dir="auto">
                          <span className="text-muted-foreground line-through">{c.from}</span> <span aria-hidden>→</span>
                          <span className="sr-only">changed to</span> <span className="font-medium">{c.to}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : (
                <p className="mb-6 text-sm text-muted-foreground">No field-by-field changes to show for this entry.</p>
              )}

              <details className="rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted-foreground">Technical details</summary>
                <div className="space-y-3 px-4 pb-4">
                  <p className="text-xs text-muted-foreground">
                    {selected.operation} on <span className="font-mono">{selected.table}</span>
                  </p>
                  {selected.before != null && (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-800">
                      {JSON.stringify(selected.before, null, 2)}
                    </pre>
                  )}
                  {selected.after != null && (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-green-200 bg-green-50 p-3 font-mono text-xs text-green-800">
                      {JSON.stringify(selected.after, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
