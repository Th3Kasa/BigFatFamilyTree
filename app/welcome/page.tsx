import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { loadWelcomeData } from "@/lib/members/welcome-data";
import { WelcomeFlow } from "@/components/members/WelcomeFlow";
import { GateHeader } from "@/components/members/GateHeader";

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

  const data = await loadWelcomeData(supabase, user);

  return (
    <>
      {/* Accounts still waiting for access have no app shell, so they get a slim header. */}
      {data.approved ? null : <GateHeader lang={lang} />}
      <WelcomeFlow
        // A new key re-mounts the flow when the server's answer changes (e.g. an
        // admin approved the request while the page was open).
        key={`${data.screen}:${data.linked?.id ?? "-"}:${data.pending ? "p" : "-"}`}
        lang={lang}
        fullName={data.fullName}
        initialResults={data.initialResults}
        pending={data.pending}
        linked={data.linked}
        screen={data.screen}
        approved={data.approved}
        suggestions={data.suggestions}
        adminName={data.adminName}
      />
    </>
  );
}
