import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { fetchCurrentPerson } from "@/lib/members/current-person";
import { searchClaimCandidates } from "@/lib/members/search";
import { buildPersonSummary, PERSON_SUMMARY_COLUMNS, type PersonRow } from "@/lib/members/summary";
import { WelcomeFlow, type PendingClaim } from "@/components/members/WelcomeFlow";

export const metadata: Metadata = {
  title: "Find yourself in the family tree",
};

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/welcome");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, display_name, date_of_birth, person_id")
    .eq("id", user.id)
    .maybeSingle();

  const fullName =
    profile?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    profile?.display_name ??
    "";
  // display_name defaults to the email's local part for accounts that never typed a name.
  const prefill = fullName.includes("@") ? "" : fullName;

  const linked = profile?.person_id ? await fetchCurrentPerson(supabase, user.id) : null;

  let pending: PendingClaim | null = null;
  if (!linked) {
    const { data: request } = await supabase
      .from("link_requests")
      .select("person_id")
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (request) {
      let person = null;
      if (request.person_id) {
        const { data: row } = await supabase
          .from("people")
          .select(PERSON_SUMMARY_COLUMNS)
          .eq("id", request.person_id)
          .maybeSingle();
        if (row) person = buildPersonSummary(row as unknown as PersonRow, new Map());
      }
      pending = { person };
    }
  }

  const initialResults =
    linked || pending
      ? []
      : await searchClaimCandidates(supabase, {
          query: prefill,
          dob: profile?.date_of_birth ?? null,
        });

  return (
    <WelcomeFlow
      lang={lang}
      fullName={prefill}
      initialResults={initialResults}
      pending={pending}
      linked={linked}
    />
  );
}
