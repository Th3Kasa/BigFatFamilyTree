// "Suggest a relative": validation and the review state machine, mirroring
// public.guard_relative_suggestion() (supabase/migrations/20260522000020_member_journey.sql).

import { z } from "zod";

export type SuggestionStatus = "pending" | "added" | "already_in_tree" | "dismissed";

export const SUGGESTIONS_PER_DAY = 10;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const suggestRelativeSchema = z.object({
  name: text(2, 120).refine((v) => /\p{L}/u.test(v)),
  relation: text(2, 120),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type SuggestRelativeInput = z.input<typeof suggestRelativeSchema>;

export const suggestionIdSchema = z.object({ suggestionId: z.string().uuid() });
export const resolveSuggestionSchema = z.object({
  suggestionId: z.string().uuid(),
  personId: z
    .string()
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
});

/**
 * pending -> added | already_in_tree | dismissed   (admin only)
 * Everything else is final, and members cannot change a suggestion at all.
 */
export function canTransitionSuggestion(
  actor: "owner" | "admin",
  from: SuggestionStatus,
  to: SuggestionStatus,
): boolean {
  if (actor !== "admin") return false;
  return from === "pending" && to !== "pending";
}

/** May this member file another suggestion? `recent` = their suggestions in the last 24 hours. */
export function canSuggestAnother(recent: number): boolean {
  return recent < SUGGESTIONS_PER_DAY;
}

/** The insert-time rules the database enforces for a non-admin. */
export function guardSuggestionInsert(
  actorId: string,
  row: { suggested_by: string; status: SuggestionStatus; person_id: string | null; handled_by: string | null },
  recentCount: number,
): { ok: true } | { ok: false; reason: string } {
  if (row.suggested_by !== actorId) return { ok: false, reason: "own account only" };
  if (row.status !== "pending" || row.person_id !== null || row.handled_by !== null) {
    return { ok: false, reason: "must be pending" };
  }
  if (!canSuggestAnother(recentCount)) return { ok: false, reason: "daily limit" };
  return { ok: true };
}

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, { en: string; ar: string }> = {
  pending: { en: "Waiting for an admin", ar: "بانتظار المشرف" },
  added: { en: "Added to the tree", ar: "تمت الإضافة إلى الشجرة" },
  already_in_tree: { en: "Already in the tree", ar: "موجود في الشجرة بالفعل" },
  dismissed: { en: "Not added", ar: "لم تتم الإضافة" },
};
