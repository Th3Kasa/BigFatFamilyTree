import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { CanvasView } from "@/components/graph/CanvasView";
import { MobilePeopleSheet } from "@/components/MobilePeopleSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { TopBar } from "@/components/shell/TopBar";
import { NavRail } from "@/components/shell/NavRail";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";

const TREE_COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y";

export default async function HomePage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: { user } } = await supabase.auth.getUser();

  // Guests explore the whole tree read-only, right inside the dashboard shell —
  // they sign in from within the app, not behind a wall. The tree is fetched
  // with the service client so RLS stays locked (no anonymous DB access); only
  // the public "card" columns are read. Profiles, details, and every edit
  // require signing in (enforced by middleware + RLS on those routes).
  if (!user) {
    const service = createServiceClient();
    const [{ data: gPeople }, { data: gRels }] = await Promise.all([
      service.from("people").select(TREE_COLUMNS).is("deleted_at", null).order("given_en"),
      service.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
    ]);

    const guestPeople = (gPeople ?? []) as PersonInput[];
    const guestTree =
      guestPeople.length > 0
        ? buildGraphElements(guestPeople, (gRels ?? []) as RelationshipInput[], lang)
        : null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] grid-rows-[auto_1fr] min-h-svh">
        <TopBar user={null} lang={lang} />
        <NavRail lang={lang} />
        <main className="overflow-hidden">
          {guestTree ? (
            <div
              className="canvas-stage relative h-[calc(100svh-57px)] overflow-hidden"
              data-grain="on"
            >
              <CanvasView
                initialNodes={guestTree.nodes}
                initialEdges={guestTree.edges}
                people={guestPeople}
                relationships={(gRels ?? []) as RelationshipInput[]}
                lang={lang}
                readOnly
              />
            </div>
          ) : (
            <div className="flex h-[calc(100svh-57px)] items-center justify-center px-4">
              <div className="max-w-sm text-center">
                <div className="mb-4 text-5xl">🌳</div>
                <h1
                  className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {lang === "ar" ? "أهلاً بالعائلة" : "Welcome to the family"}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  {lang === "ar"
                    ? "لا يوجد أفراد بعد. سجّل الدخول لبدء الشجرة."
                    : "No family members yet. Sign in to start the tree."}
                </p>
                <Link
                  href="/login"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-[var(--shadow-floating)] transition-transform hover:-translate-y-0.5"
                >
                  {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  const [{ data: people }, { data: relationships }] = await Promise.all([
    supabase.from("people").select(TREE_COLUMNS).is("deleted_at", null).order("given_en"),
    supabase.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
  ]);

  const isEmpty = !people || people.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto w-full px-4 pt-16 pb-24 md:pb-8">
        <EmptyState
          icon="🌱"
          title="Start your family tree"
          description="No family members added yet. Add the first person to get started."
          action={
            <Link
              href="/person/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-semibold text-sm transition-colors"
            >
              ＋ Add person
            </Link>
          }
        />
      </div>
    );
  }

  const typedPeople = people as PersonInput[];
  const { nodes, edges } = buildGraphElements(typedPeople, relationships ?? [], lang);

  return (
    <>
      {/* Canvas — always primary, full viewport */}
      <div
        className="canvas-stage relative h-[calc(100vh-57px-64px)] md:h-[calc(100vh-57px)] overflow-hidden"
        data-grain="on"
      >
        <CanvasView
          initialNodes={nodes}
          initialEdges={edges}
          people={typedPeople}
          relationships={(relationships ?? []) as RelationshipInput[]}
          lang={lang}
        />
      </div>

      {/* Mobile: bottom-sheet people list, triggered by FAB */}
      <MobilePeopleSheet people={typedPeople} lang={lang} />
    </>
  );
}
