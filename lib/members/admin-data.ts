import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { buildPersonSummary, PERSON_SUMMARY_COLUMNS, type PersonRow } from "./summary";
import { countWaiting, isApproved, needsAccessDecision } from "./approval";
import type {
  MemberAccount,
  MemberRole,
  MembersAdminData,
  MemberRow,
  PendingRequest,
  PersonSummary,
  SuggestionRow,
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
  approved_at: string | null;
  is_super_admin: boolean;
};

type AuthStatus = { email: string | null; email_confirmed_at: string | null };

function toAccount(p: ProfileRow, auth: AuthStatus | undefined): MemberAccount {
  // auth.users is the live address; profiles.email is a sign-up-time copy.
  const email = auth?.email ?? p.email;
  return {
    id: p.id,
    fullName: p.full_name ?? p.display_name ?? email?.split("@")[0] ?? "—",
    email,
    emailConfirmed: auth ? auth.email_confirmed_at !== null : null,
    dateOfBirth: p.date_of_birth,
    createdAt: p.created_at,
    role: p.role,
    personId: p.person_id,
    approved: isApproved(p),
    isSuperAdmin: p.is_super_admin,
  };
}

/** Everything the /admin/members page renders. Caller must already be an admin. */
export async function loadMembersAdminData(supabase: Client): Promise<MembersAdminData> {
  const [profilesRes, requestsRes, peopleRes, authRes, suggestionsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, full_name, email, date_of_birth, created_at, role, person_id, approved_at, is_super_admin")
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
    // Admin-only SECURITY DEFINER RPC (20260521000018). If it is missing or
    // fails, the page still works and simply shows no confirmation badges.
    supabase.rpc("admin_member_auth_status"),
    supabase
      .from("relative_suggestions")
      .select("id, suggested_by, name, relation, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const loadError = profilesRes.error?.message ?? requestsRes.error?.message ?? peopleRes.error?.message;
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const peopleRows = (peopleRes.data ?? []) as unknown as PersonRow[];

  const parents = new Map(peopleRows.map((p) => [p.id, { given_en: p.given_en, given_ar: p.given_ar }]));
  const people: PersonSummary[] = peopleRows.map((r) => buildPersonSummary(r, parents));
  const personById = new Map(people.map((p) => [p.id, p]));
  const authRows = (authRes.error ? [] : (authRes.data ?? [])) as Array<AuthStatus & { id: string }>;
  const authById = new Map<string, AuthStatus>(authRows.map((a) => [a.id, a]));
  const accountById = new Map(profiles.map((p) => [p.id, toAccount(p, authById.get(p.id))]));

  const members: MemberRow[] = profiles.map((p) => ({
    ...toAccount(p, authById.get(p.id)),
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

  const pendingProfileIds = new Set(pending.map((p) => p.account.id));
  const waitingAccess = [...accountById.values()].filter((a) => needsAccessDecision(a, pendingProfileIds));

  // A suggestions table that isn't migrated yet must not take the page down.
  const suggestions: SuggestionRow[] = [];
  for (const s of suggestionsRes.error ? [] : (suggestionsRes.data ?? [])) {
    const by = accountById.get(s.suggested_by);
    if (!by) continue;
    suggestions.push({
      id: s.id,
      createdAt: s.created_at,
      name: s.name,
      relation: s.relation,
      note: s.note,
      suggestedBy: by,
    });
  }

  return { pending, waitingAccess, suggestions, members, people, loadError };
}

/** Number of requests waiting for review. Admin only. */
export async function countPendingLinkRequests(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("link_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

/**
 * Everything waiting for an admin, for the "Members" nav badge: pending link
 * requests, accounts nobody has let in yet (without double-counting those that
 * already have a request) and suggested relatives. Admin only; never throws.
 */
export async function countPendingMembers(supabase: Client): Promise<number> {
  try {
    const [requests, unapproved, suggestions] = await Promise.all([
      supabase.from("link_requests").select("profile_id").eq("status", "pending"),
      supabase.from("profiles").select("id, role").is("approved_at", null),
      supabase
        .from("relative_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    return countWaiting({
      pendingRequestProfileIds: (requests.data ?? []).map((r) => r.profile_id),
      unapproved: (unapproved.data ?? []) as Array<{ id: string; role: MemberRole }>,
      pendingSuggestions: suggestions.error ? 0 : (suggestions.count ?? 0),
    });
  } catch {
    return 0;
  }
}
