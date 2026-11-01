import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AuditTable, type AuditEntry } from "@/components/admin/AuditTable";
import { describeAudit, redact, referencedIds, type AuditInput } from "@/lib/audit/describe";

const PAGE_SIZE = 50;

type Props = { searchParams: Promise<{ page?: string }> };

/** "Sun 1 Nov 2026, 6:46 pm", in the family's time zone (the same on the server and in the browser). */
const WHEN = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AuditLogPage({ searchParams }: Props) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: rows, count } = await supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // Look up every name the page needs in two queries.
  const inputs: (AuditInput & { id: string; created_at: string })[] = (rows ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    operation: r.operation,
    table_name: r.table_name,
    row_id: r.row_id ?? null,
    actor_id: r.actor_id ?? null,
    before: r.before ?? null,
    after: r.after ?? null,
  }));
  const ids = referencedIds(inputs);
  const [{ data: profiles }, { data: people }] = await Promise.all([
    ids.members.length
      ? supabase.from("profiles").select("id, first_name, last_name, display_name, full_name, email, person_id").in("id", ids.members)
      : Promise.resolve({ data: [] }),
    ids.people.length
      ? supabase.from("people").select("id, given_en, given_ar, family_name_en, family_name_ar").in("id", ids.people)
      : Promise.resolve({ data: [] }),
  ]);
  const personName = new Map(
    (people ?? []).map((p) => [p.id, [p.given_en ?? p.given_ar, p.family_name_en ?? p.family_name_ar].filter(Boolean).join(" ").trim()]),
  );
  // Members linked to a tree card that isn't on this page still get a name.
  const linked = (profiles ?? []).map((p) => p.person_id).filter((id): id is string => !!id && !personName.has(id));
  if (linked.length) {
    const { data: more } = await supabase.from("people").select("id, given_en, given_ar, family_name_en, family_name_ar").in("id", linked);
    for (const p of more ?? []) personName.set(p.id, [p.given_en ?? p.given_ar, p.family_name_en ?? p.family_name_ar].filter(Boolean).join(" ").trim());
  }
  const memberName = new Map(
    (profiles ?? []).map((p) => {
      const own = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.display_name?.trim() || p.full_name?.trim();
      const fromTree = p.person_id ? personName.get(p.person_id) : null;
      // PIN accounts have a generated "m-<id>@…" address; that's no name.
      const fromEmail = p.email && !p.email.startsWith("m-") ? p.email.split("@")[0] : null;
      // The name on their tree card (e.g. "Nina-Joyce Gaballah") beats what they typed at sign-up ("Nina").
      return [p.id, fromTree || own || fromEmail || "A member"];
    }),
  );
  const names = {
    member: (id: string | null | undefined) => (id ? memberName.get(id) ?? null : null),
    person: (id: string | null | undefined) => (id ? personName.get(id) || null : null),
  };

  const entries: AuditEntry[] = inputs.map((r) => {
    const view = describeAudit(r, names);
    return {
      id: r.id,
      when: WHEN.format(new Date(r.created_at)),
      iso: r.created_at,
      who: view.who,
      what: view.what,
      kind: view.kind,
      changes: view.changes,
      table: r.table_name,
      operation: r.operation,
      before: redact(r.before),
      after: redact(r.after),
    };
  });

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto pb-20 md:pb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold">Audit Log</CardTitle>
          <span className="text-sm text-muted-foreground">{count ?? 0} total entries</span>
        </CardHeader>
        <CardContent>
          <AuditTable entries={entries} page={page} totalPages={totalPages} count={count ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}
