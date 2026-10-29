import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { normalizeClaimQuery, toClaimCandidate, type ClaimRow } from "./claim-query";
import type { ClaimCandidate } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * People who might be the signed-in member, for "Find yourself". An account
 * that is still waiting for access cannot read `people`, so this goes through
 * public.search_people_for_claim() (SECURITY DEFINER): at most 20 rows with a
 * few display columns and the birth YEAR only, ranked exact birth date, then
 * birth year, then name closeness. Parents come back as names so the member
 * can tell two "Omar"s apart; `claimed` greys out someone who already has an
 * account.
 */
export async function searchClaimCandidates(
  supabase: Client,
  opts: { query: string; dob: string | null; limit?: number },
): Promise<ClaimCandidate[]> {
  const normalized = normalizeClaimQuery(opts.query, opts.dob);
  if (!normalized.ok) return [];

  const { data, error } = await supabase.rpc("search_people_for_claim", {
    q: normalized.input.q,
    dob: normalized.input.dob,
  });
  if (error || !data) return [];

  const { data: claimedData } = await supabase.rpc("claimed_person_ids");
  const claimed = new Set<string>((claimedData as string[] | null) ?? []);

  return (data as ClaimRow[]).slice(0, opts.limit ?? 20).map((row) => toClaimCandidate(row, claimed));
}
