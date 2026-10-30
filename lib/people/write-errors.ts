// Plain-language messages for writes the database refused because of the
// family-scope rule (migration 30). Postgres RLS refuses an INSERT with an
// error but quietly skips UPDATE/DELETE rows the caller may not touch, so
// callers also treat "nothing changed" as this refusal.

export const OUT_OF_SCOPE =
  "You can only change people in your own close family. Ask an admin to change this one.";
export const ADMIN_ONLY_DELETE = "Only an admin can delete a person from the tree.";

type DbError = { code?: string | null; message?: string | null; hint?: string | null } | null | undefined;

/** A refusal written by our own guards (out-of-scope link, admin-only delete): their message is already plain. */
export function scopeErrorMessage(error: DbError): string | null {
  if (!error) return null;
  if (error.hint === "admin_only_delete") return ADMIN_ONLY_DELETE;
  if (error.hint === "out_of_scope_link" && error.message) return error.message;
  if (error.code === "42501" || /row-level security/i.test(error.message ?? "")) return OUT_OF_SCOPE;
  return null;
}

/** The message to show for a failed write: the scope message when it applies, otherwise the database's own. */
export function writeErrorMessage(error: DbError, fallback = "Something went wrong. Please try again."): string {
  return scopeErrorMessage(error) ?? error?.message ?? fallback;
}
