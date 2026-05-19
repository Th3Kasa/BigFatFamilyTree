import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

type Props = { searchParams: Promise<{ page?: string }> };

export default async function AuditLogPage({ searchParams }: Props) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: rows, count } = await supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Audit Log</h2>
        <span className="text-sm text-gray-400">{count ?? 0} total entries</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operation</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Table</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Row ID</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    r.operation === "insert" ? "bg-green-50 text-green-700 border-green-200" :
                    r.operation === "delete" ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-blue-50 text-blue-700 border-blue-200"
                  }`}>
                    {r.operation}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-gray-700">{r.table_name}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-400">{r.row_id?.slice(0, 8) ?? "—"}…</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-400">{r.actor_id?.slice(0, 8) ?? "—"}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2">
          {page > 1 && (
            <a
              href={`/admin/audit?page=${page - 1}`}
              className="px-3 py-1 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              ← Prev
            </a>
          )}
          <span className="px-3 py-1 text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/admin/audit?page=${page + 1}`}
              className="px-3 py-1 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </>
  );
}
