import { createClient } from "@/lib/supabase/server";
import { updateUserRole } from "@/lib/actions/admin";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Mic, Sparkles, ClipboardList, Link2, Shield } from "lucide-react";
import Link from "next/link";
import type { Database } from "@/lib/db/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  editor: "bg-amber-100 text-amber-700 border-amber-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

async function handleRoleUpdate(formData: FormData) {
  "use server";
  await updateUserRole(null, formData);
}

function RoleSelect({ profile }: { profile: Profile }) {
  return (
    <form action={handleRoleUpdate}>
      <input type="hidden" name="userId" value={profile.id} />
      <div className="flex items-center gap-2">
        <select
          name="role"
          defaultValue={profile.role}
          className="border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        >
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: peopleCount },
    { count: transcriptsCount },
    { count: pendingCount },
    { data: recentAudit },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("people").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("transcripts").select("*", { count: "exact", head: true }),
    supabase.from("extraction_proposals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("audit_log")
      .select("id, created_at, operation, table_name, row_id, actor_id")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
  ]);

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto pb-20 md:pb-6">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-6 sm:mb-8">Admin Dashboard</h1>

      {/* Bento grid — stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* People count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total People</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-[Fraunces,serif] text-4xl font-semibold text-foreground">
              {peopleCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Active family members</p>
          </CardContent>
        </Card>

        {/* Transcripts count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Transcripts</CardTitle>
            <Mic className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-[Fraunces,serif] text-4xl font-semibold text-foreground">
              {transcriptsCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Audio recordings</p>
          </CardContent>
        </Card>

        {/* Pending proposals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Proposals</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-[Fraunces,serif] text-4xl font-semibold text-amber-600">
              {pendingCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
          </CardContent>
        </Card>

        {/* Recent audit events */}
        <Card className="sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentAudit && recentAudit.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentAudit.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        r.operation === "insert"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : r.operation === "delete"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {r.operation}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">{r.table_name}</span>
                    <span className="text-xs text-muted-foreground ms-auto">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No recent events.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Links</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li>
                <Link href="/people" className="text-sm text-amber-600 hover:underline">
                  → People
                </Link>
              </li>
              <li>
                <Link href="/transcripts" className="text-sm text-amber-600 hover:underline">
                  → Transcripts
                </Link>
              </li>
              <li>
                <Link href="/admin/audit" className="text-sm text-amber-600 hover:underline">
                  → Audit Log
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* User management */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">User Management</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Change role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(profiles ?? []).map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[p.role] ?? ROLE_COLORS.viewer}`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <RoleSelect profile={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
