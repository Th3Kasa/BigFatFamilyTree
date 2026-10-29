import Link from "next/link";
import { Network, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLang, type Lang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { CanvasView } from "@/components/graph/CanvasView";
import { RelationshipBanner } from "@/components/relationships/RelationshipBanner";
import { makeKinContext, relate } from "@/lib/kinship/view";
import { Landing } from "@/components/landing/Landing";
import { homeEntry } from "@/lib/members/journey";
import { handleFirstVisit } from "@/lib/members/onboarding";
import { withSignedPhotos } from "@/lib/storage/photos";
import { fetchBirthOrders, withBirthOrder } from "@/lib/people/birth-order";
import { countGenerations } from "@/lib/people/stats";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";

const TREE_COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y, birth_date, death_date";

type SearchParams = Promise<{
  from?: string | string[];
  to?: string | string[];
  focus?: string | string[];
  tour?: string | string[];
}>;

/**
 * `/?from=<id>&to=<id>` lights up how two people are related. Ids that don't
 * match a person (or pairs with no connection) simply show the plain tree.
 */
function pathFromQuery(
  params: Awaited<SearchParams>,
  people: PersonInput[],
  relationships: RelationshipInput[],
) {
  const from = typeof params.from === "string" ? params.from : null;
  const to = typeof params.to === "string" ? params.to : null;
  if (!from || !to) return null;
  const outcome = relate(makeKinContext(people, relationships), from, to);
  return outcome.status === "found" ? { view: outcome.view, from, to } : null;
}

/** `/?focus=<id>`: open centred on that person (ignored if they aren't on the tree). */
function focusFromQuery(params: Awaited<SearchParams>, people: PersonInput[]) {
  const id = typeof params.focus === "string" ? params.focus : null;
  return id && people.some((p) => p.id === id) ? id : null;
}

function treeSummary(people: PersonInput[], stories: number | null, lang: Lang) {
  const real = people.filter((p) => !p.is_placeholder);
  const generations = countGenerations(real);
  const title = lang === "ar" ? "عائلة بيغ فات" : "The Big Fat Family";
  const parts =
    lang === "ar"
      ? [
          real.length === 1 ? "شخص واحد" : `${real.length} أشخاص`,
          generations === 1 ? "جيل واحد" : `${generations} أجيال`,
          ...(stories ? [stories === 1 ? "قصة واحدة" : `${stories} قصص`] : []),
        ]
      : [
          `${real.length} ${real.length === 1 ? "person" : "people"}`,
          `${generations} ${generations === 1 ? "generation" : "generations"}`,
          ...(stories ? [`${stories} ${stories === 1 ? "story" : "stories"}`] : []),
        ];
  return { title, subtitle: parts.join(" · ") };
}

function TreeHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h1 className="font-heading truncate text-xl font-bold leading-tight text-[var(--foreground)] md:text-[28px]">{title}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)] md:mt-1 md:text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const [supabase, lang, params] = await Promise.all([createClient(), getLang(), searchParams]);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const { data: { user } } = await supabase.auth.getUser();

  // Signed-out visitors get the landing page and NOTHING else: no queries, no
  // service client, no family data. A deep link (/?from=…&to=…) goes to sign-in
  // first and comes back here afterwards.
  const entry = homeEntry({ signedIn: !!user, params });
  if (entry.kind === "login") redirect(`/login?next=${encodeURIComponent(entry.next)}`);
  if (entry.kind === "landing" || !user) return <Landing lang={lang} />;

  // First visit after approval: send a linked member to the tour once (and
  // stamp profiles.onboarded_at when they arrive there).
  await handleFirstVisit(supabase, user.id, params);

  const [{ data: peopleRows }, { data: relationships }, { count: storyCount }, { data: profile }, birthOrders] = await Promise.all([
    supabase.from("people").select(TREE_COLUMNS).is("deleted_at", null).order("given_en"),
    supabase.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("type", "notable_story"),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    fetchBirthOrders(supabase),
  ]);
  // Photos live in a private bucket: sign them here so the canvas gets ready-to-use URLs.
  const people = peopleRows ? withBirthOrder(await withSignedPhotos(supabase, peopleRows), birthOrders) : peopleRows;
  const role = (profile as { role?: string | null } | null)?.role;
  const canEdit = role === "admin" || role === "editor";

  if (!people || people.length === 0) {
    return (
      <div className="flex min-h-[calc(100svh-var(--topbar-h)-var(--tabbar-h))] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <Network className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="font-heading text-2xl font-bold text-[var(--foreground)]">
            {t("Start your family tree", "ابدأ شجرة عائلتك")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {canEdit
              ? t("Add the first person and the tree grows from there.", "أضف أول شخص وستنمو الشجرة من هناك.")
              : t("No one has been added yet. An admin or editor can add the first person.", "لم تتم إضافة أحد بعد. يمكن للمشرف أو المحرّر إضافة أول شخص.")}
          </p>
          {canEdit && (
            <Link
              href="/person/new"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              {t("Add the first person", "أضف أول شخص")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const typedPeople = people as PersonInput[];
  const typedRels = (relationships ?? []) as RelationshipInput[];
  const { nodes, edges } = buildGraphElements(typedPeople, typedRels, lang);
  const path = pathFromQuery(params, typedPeople, typedRels);
  const summary = treeSummary(typedPeople, storyCount ?? null, lang);

  return (
    <div className="flex h-[calc(100svh-var(--topbar-h)-var(--tabbar-h))] flex-col gap-3 p-3 md:gap-4 md:px-6 md:py-5">
      <TreeHeader title={summary.title} subtitle={summary.subtitle} />
      <div className="canvas-stage relative min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[var(--border)]">
        <CanvasView
          initialNodes={nodes}
          initialEdges={edges}
          people={typedPeople}
          lang={lang}
          highlight={path?.view.highlight}
          focusId={path ? null : focusFromQuery(params, typedPeople)}
        />
        {path && (
          <RelationshipBanner
            lang={lang}
            answer={path.view.oneLine}
            finderHref={`/relationships?${new URLSearchParams({ a: path.from, b: path.to }).toString()}`}
          />
        )}
      </div>
    </div>
  );
}
