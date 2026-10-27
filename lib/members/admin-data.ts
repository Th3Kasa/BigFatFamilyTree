import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { buildPersonSummary, PERSON_SUMMARY_COLUMNS, type PersonRow } from "./summary";
import type {
  MemberAccount,
  MemberRole,
  MembersAdminData,
  MemberRow,
  PendingRequest,
  PersonSummary,
} from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

type ProfileRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  created_at: string;
  role: MemberRole;
  person_id: string | null;
};

function toAccount(p: ProfileRow): MemberAccount {
  return {
    id: p.id,
    fullName: p.full_name ?? p.display_name ?? p.email?.split("@")[0] ?? "—",
    email: p.email,
    dateOfBirth: p.date_of_birth,
    createdAt: p.created_at,
    role: p.role,
    personId: p.person_id,
  };
}

/** Everything the /admin/members page renders. Caller must already be an admin. */
export async function loadMembersAdminData(supabase: Client): Promise<MembersAdminData> {
  const [profilesRes, requestsRes, peopleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, full_name, email, date_of_birth, created_at, role, person_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("link_requests")
      .select("id, profile_id, person_id, parents_note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("people")
      .select(PERSON_SUMMARY_COLUMNS)
      .is("deleted_at", null)
      .order("given_en", { ascending: true }),
  ]);

  const loadError = profilesRes.error?.message ?? requestsRes.error?.message ?? peopleRes.error?.message;
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const peopleRows = (peopleRes.data ?? []) as unknown as PersonRow[];

  const parents = new Map(peopleRows.map((p) => [p.id, { given_en: p.given_en, given_ar: p.given_ar }]));
  const people: PersonSummary[] = peopleRows.map((r) => buildPersonSummary(r, parents));
  const personById = new Map(people.map((p) => [p.id, p]));
  const accountById = new Map(profiles.map((p) => [p.id, toAccount(p)]));

  const members: MemberRow[] = profiles.map((p) => ({
    ...toAccount(p),
    person: p.person_id ? (personById.get(p.person_id) ?? null) : null,
  }));

  const pending: PendingRequest[] = [];
  for (const r of requestsRes.data ?? []) {
    const account = accountById.get(r.profile_id);
    if (!account) continue;
    const owner = r.person_id ? profiles.find((p) => p.person_id === r.person_id) : undefined;
    pending.push({
      id: r.id,
      createdAt: r.created_at,
      parentsNote: r.parents_note,
      account,
      person: r.person_id ? (personById.get(r.person_id) ?? null) : null,
      personClaimedByOther: !!owner && owner.id !== r.profile_id,
    });
  }

  return { pending, members, people, loadError };
}

/** Number of requests waiting for review (for a nav badge). Admin only. */
export async function countPendingLinkRequests(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("link_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
