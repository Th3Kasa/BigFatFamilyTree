import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { rankCandidates } from "./match";
import { buildPersonSummary, PERSON_SUMMARY_COLUMNS, type PersonRow } from "./summary";
import type { ClaimCandidate } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

const SEARCH_COLUMNS = `${PERSON_SUMMARY_COLUMNS}, grandfather_name_en, grandfather_name_ar, great_grandfather_name_en, great_grandfather_name_ar`;

const NAME_FIELDS = [
  "given_en",
  "given_ar",
  "family_name_en",
  "family_name_ar",
  "father_name_en",
  "father_name_ar",
  "grandfather_name_en",
  "grandfather_name_ar",
] as const;

type SearchRow = PersonRow & {
  grandfather_name_en: string | null;
  grandfather_name_ar: string | null;
  great_grandfather_name_en: string | null;
  great_grandfather_name_ar: string | null;
};

/** Words safe to splice into a PostgREST filter: letters and digits only. */
function filterTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 5);
}

/**
 * People who might be the signed-in member: name overlap (any language, any part
 * of the name chain) or the same birth date, ranked exact-DOB first, then same
 * birth year, then by name closeness. Each result carries its parents so the
 * member can tell two "Omar"s apart, and whether someone already owns it.
 */
export async function searchClaimCandidates(
  supabase: Client,
  opts: { query: string; dob: string | null; limit?: number },
): Promise<ClaimCandidate[]> {
  const tokens = filterTokens(opts.query);
  const conds: string[] = [];
  for (const t of tokens) for (const f of NAME_FIELDS) conds.push(`${f}.ilike.%${t}%`);
  if (opts.dob && /^\d{4}-\d{2}-\d{2}$/.test(opts.dob)) {
    conds.push(`birth_date.eq.${opts.dob}`);
    conds.push(`birth_date.like.${opts.dob.slice(0, 4)}%`);
  }
  if (conds.length === 0) return [];

  const { data, error } = await supabase
    .from("people")
    .select(SEARCH_COLUMNS)
    .is("deleted_at", null)
    .or(conds.join(","))
    .limit(300);
  if (error || !data) return [];

  const rows = data as unknown as SearchRow[];
  const ranked = rankCandidates(rows, { query: opts.query, dob: opts.dob }).slice(0, opts.limit ?? 12);
  if (ranked.length === 0) return [];

  const parentIds = [
    ...new Set(ranked.flatMap((r) => [r.father_id, r.mother_id]).filter((x): x is string => !!x)),
  ];
  const parents = new Map<string, { given_en: string | null; given_ar: string | null }>();
  if (parentIds.length > 0) {
    const { data: parentRows } = await supabase
      .from("people")
      .select("id, given_en, given_ar")
      .in("id", parentIds);
    for (const p of parentRows ?? []) parents.set(p.id, { given_en: p.given_en, given_ar: p.given_ar });
  }

  const { data: claimedData } = await supabase.rpc("claimed_person_ids");
  const claimed = new Set<string>((claimedData as string[] | null) ?? []);

  return ranked.map((r) => ({
    ...buildPersonSummary(r, parents),
    dobMatch: r.dobMatch,
    claimed: claimed.has(r.id),
  }));
}
