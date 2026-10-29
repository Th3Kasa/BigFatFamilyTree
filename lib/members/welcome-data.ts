import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isApproved } from "./approval";
import { toPersonSummary, type ClaimRow } from "./claim-query";
import { fetchCurrentPerson } from "./current-person";
import { journeyScreen, latestRequestState, type JourneyScreen, type RequestState } from "./journey";
import { searchClaimCandidates } from "./search";
import { ClaimSearchLimitError } from "./claim-query";
import type { ClaimCandidate, CurrentPerson, MySuggestion, PersonSummary } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

export type WelcomeData = {
  screen: JourneyScreen;
  approved: boolean;
  fullName: string;
  linked: CurrentPerson | null;
  /** Their open request: the person they picked, or null person = "not in the tree yet". */
  pending: { person: PersonSummary | null } | null;
  request: RequestState;
  initialResults: ClaimCandidate[];
  suggestions: MySuggestion[];
  /** Always null for now: waiting accounts are told "the family admins", never a name. */
  adminName: string | null;
};

/** Everything /welcome renders. Works for accounts that cannot read `people` yet. */
export async function loadWelcomeData(
  supabase: Client,
  user: { id: string; user_metadata?: Record<string, unknown> | null },
): Promise<WelcomeData> {
  const [{ data: profile }, { data: requests }, { data: suggestionRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, display_name, date_of_birth, person_id, role, approved_at, onboarded_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("link_requests").select("status, created_at").eq("profile_id", user.id),
    supabase
      .from("relative_suggestions")
      .select("id, name, relation, status, created_at")
      .eq("suggested_by", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const approved = isApproved(profile);
  const fullName =
    profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? profile?.display_name ?? "";
  // display_name defaults to the email's local part for accounts that never typed a name.
  const prefill = fullName.includes("@") ? "" : fullName;

  const linked = profile?.person_id ? await fetchCurrentPerson(supabase, user.id) : null;
  const request = latestRequestState(requests ?? []);
  const screen = journeyScreen({
    signedIn: true,
    approved,
    linked: !!profile?.person_id,
    request,
    onboarded: profile?.onboarded_at != null,
  });

  let pending: WelcomeData["pending"] = null;
  if (!linked && request === "pending") {
    const { data: row } = await supabase.rpc("my_pending_claim_person");
    const claimRow = (row as ClaimRow[] | null)?.[0];
    pending = { person: claimRow ? toPersonSummary(claimRow) : null };
  }

  // Accounts waiting for access are never told which admin to ask (no names).
  const adminName: string | null = null;

  let initialResults: ClaimCandidate[] = [];
  if (!linked && !pending && screen !== "declined") {
    try {
      initialResults = await searchClaimCandidates(supabase, { query: prefill, dob: profile?.date_of_birth ?? null });
    } catch (e) {
      if (!(e instanceof ClaimSearchLimitError)) throw e;
    }
  }

  return {
    screen,
    approved,
    fullName: prefill,
    linked,
    pending,
    request,
    initialResults,
    suggestions: (suggestionRows ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      relation: s.relation,
      status: s.status,
      createdAt: s.created_at,
    })),
    adminName,
  };
}
