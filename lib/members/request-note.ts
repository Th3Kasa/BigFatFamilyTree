// The "I'm not in the tree yet" form collects a few optional facts. They all
// travel in link_requests.parents_note (max 500 characters in the database).

export const REQUEST_NOTE_MAX = 500;
export const REQUEST_FIELD_MAX = 120;

export type NotInTreeDetails = {
  fatherName?: string | null;
  motherName?: string | null;
  invitedBy?: string | null;
};

const clean = (v: string | null | undefined) =>
  (v ?? "").replace(/\s+/g, " ").trim().slice(0, REQUEST_FIELD_MAX);

/** "Father: X / Mother: Y / Invited by: Z" as separate lines; null when nothing was filled in. */
export function buildRequestNote(details: NotInTreeDetails): string | null {
  const lines = (
    [
      ["Father", clean(details.fatherName)],
      ["Mother", clean(details.motherName)],
      ["Invited by", clean(details.invitedBy)],
    ] as const
  )
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  if (lines.length === 0) return null;
  return lines.join("\n").slice(0, REQUEST_NOTE_MAX);
}
