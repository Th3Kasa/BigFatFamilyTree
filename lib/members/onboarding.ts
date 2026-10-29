import "server-only";
import { redirect } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";
import { firstVisitAction, type HomeParams } from "./journey";
import { isApproved } from "./approval";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Call at the top of the signed-in home page. The first time an approved,
 * linked member opens the app, send them to `/?tour=1`; when they arrive there,
 * stamp profiles.onboarded_at (through mark_onboarded(), the only way a member
 * can write it) so it never happens again. Never throws: a hiccup here must not
 * stop the tree from rendering.
 */
export async function handleFirstVisit(supabase: Client, userId: string, params: HomeParams): Promise<void> {
  let action: ReturnType<typeof firstVisitAction> = "none";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, approved_at, person_id, onboarded_at")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return;
    action = firstVisitAction({
      approved: isApproved(profile),
      linked: profile.person_id != null,
      onboarded: profile.onboarded_at != null,
      hasTourParam: typeof params.tour === "string" ? params.tour.length > 0 : (params.tour?.length ?? 0) > 0,
    });
    if (action === "mark-onboarded") await supabase.rpc("mark_onboarded");
  } catch (e) {
    console.error("[onboarding] first-visit check failed:", e);
    return;
  }
  // redirect() throws by design, so it stays outside the try/catch.
  if (action === "redirect-to-tour") redirect("/?tour=1");
}
