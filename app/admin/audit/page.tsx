import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AuditTable } from "@/components/admin/AuditTable";

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
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto pb-20 md:pb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold">Audit Log</CardTitle>
          <span className="text-sm text-muted-foreground">{count ?? 0} total entries</span>
        </CardHeader>
        <CardContent>
          <AuditTable
            rows={(rows ?? []).map((r) => ({
              id: r.id,
              created_at: r.created_at,
              operation: r.operation,
              table_name: r.table_name,
              row_id: r.row_id ?? null,
              actor_id: r.actor_id ?? null,
              before: r.before ?? null,
              after: r.after ?? null,
            }))}
            page={page}
            totalPages={totalPages}
            count={count ?? 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}
