"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type AuditRow = {
  id: string;
  created_at: string;
  operation: string;
  table_name: string;
  row_id: string | null;
  actor_id: string | null;
  before: unknown;
  after: unknown;
};

type Props = {
  rows: AuditRow[];
  page: number;
  totalPages: number;
  count: number;
};

const OP_COLORS: Record<string, string> = {
  insert: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800",
  delete: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  update: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
};

const ALL_OPS = ["INSERT", "UPDATE", "DELETE"];

export function AuditTable({ rows, page, totalPages, count }: Props) {
  const [activeOps, setActiveOps] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);

  function toggleOp(op: string) {
    setActiveOps((prev) => {
      const next = new Set(prev);
      if (next.has(op)) {
        next.delete(op);
      } else {
        next.add(op);
      }
      return next;
    });
  }

  const filtered =
    activeOps.size === 0
      ? rows
      : rows.filter((r) => activeOps.has(r.operation.toUpperCase()));

  return (
    <>
      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium me-1">Filter:</span>
        {ALL_OPS.map((op) => (
          <button
            key={op}
            onClick={() => toggleOp(op)}
            className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              activeOps.has(op)
                ? op === "INSERT"
                  ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700"
                  : op === "DELETE"
                  ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700"
                  : "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
            )}
          >
            {op}
          </button>
        ))}
        {activeOps.size > 0 && (
          <button
            onClick={() => setActiveOps(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden mb-6 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border sticky top-0 z-10">
              <tr>
                <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Time
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Op
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Table
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Row ID
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Actor
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRow(r)}
                  className={cn(
                    "cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/10",
                    i % 2 === 0 ? "bg-card" : "bg-muted/20"
                  )}
                >
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium border",
                        OP_COLORS[r.operation.toLowerCase()] ?? OP_COLORS.update
                      )}
                    >
                      {r.operation}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-foreground">{r.table_name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {r.row_id?.slice(0, 8) ?? "—"}…
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {r.actor_id?.slice(0, 8) ?? "—"}…
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No entries match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <a
              href={`/admin/audit?page=${page - 1}`}
              className="px-3 py-1 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              ← Prev
            </a>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/admin/audit?page=${page + 1}`}
              className="px-3 py-1 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Next →
            </a>
          )}
          <span className="ms-auto text-xs text-muted-foreground">{count} total entries</span>
        </div>
      )}

      {/* Row detail sheet */}
      <Sheet open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selectedRow && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="flex items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium border",
                      OP_COLORS[selectedRow.operation.toLowerCase()] ?? OP_COLORS.update
                    )}
                  >
                    {selectedRow.operation}
                  </span>
                  <span className="font-mono text-sm">{selectedRow.table_name}</span>
                </SheetTitle>
                <SheetDescription>
                  {new Date(selectedRow.created_at).toLocaleString()} · Row{" "}
                  <span className="font-mono">{selectedRow.row_id?.slice(0, 8) ?? "—"}</span>
                </SheetDescription>
              </SheetHeader>

              {selectedRow.before !== null && selectedRow.before !== undefined && (
                <section className="mb-6">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Before
                  </h4>
                  <pre className="text-xs font-mono bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap text-red-800 dark:text-red-300">
                    {JSON.stringify(selectedRow.before, null, 2)}
                  </pre>
                </section>
              )}

              {selectedRow.after !== null && selectedRow.after !== undefined && (
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    After
                  </h4>
                  <pre className="text-xs font-mono bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap text-green-800 dark:text-green-300">
                    {JSON.stringify(selectedRow.after, null, 2)}
                  </pre>
                </section>
              )}

              {selectedRow.before === null && selectedRow.after === null && (
                <p className="text-sm text-muted-foreground">No JSON data recorded for this event.</p>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
