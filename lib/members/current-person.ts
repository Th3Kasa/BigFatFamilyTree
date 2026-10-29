import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { withSignedPhotos } from "@/lib/storage/photos";
import type { CurrentPerson } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

const CURRENT_PERSON_COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, photo_url";

/**
 * The person the given account is confirmed to be, or null (not linked yet, the
 * person was removed, or the member-accounts migration has not run yet).
 * Never throws: callers (the root layout) must keep rendering.
 */
export async function fetchCurrentPerson(
  supabase: Client,
  userId: string,
): Promise<CurrentPerson | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", userId)
    .maybeSingle();
  const personId = profile?.person_id;
  if (!personId) return null;

  const { data: person } = await supabase
    .from("people")
    .select(CURRENT_PERSON_COLUMNS)
    .eq("id", personId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!person) return null;
  return (await withSignedPhotos(supabase, [person as CurrentPerson]))[0];
}

/**
 * Server helper: the signed-in user's linked person (id + slug + names) or null.
 * Memoised per request, so any number of server components can call it.
 */
export const getCurrentPerson = cache(async (): Promise<CurrentPerson | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return fetchCurrentPerson(supabase, user.id);
});
