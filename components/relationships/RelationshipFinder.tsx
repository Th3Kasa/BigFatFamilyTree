"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Copy, ExternalLink, GitFork, Network, Route, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { makeKinContext, personName, relate, stepsText, type Lang, type RelationshipView, type Segments } from "@/lib/kinship/view";
import type { GraphEdge, GraphNode, PersonInput, RelationshipInput } from "@/lib/graph/transform";
import { PersonCombobox } from "./PersonCombobox";
import { StepList } from "./StepList";

const STORAGE_KEY = "bft.relationships.firstPerson";

// Rendered on the server too (dynamic fallback), so it can't depend on the page language.
function CanvasSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the tree… · جارٍ تحميل الشجرة…"
      className="canvas-stage flex h-full min-h-[360px] items-center justify-center"
    >
      <div className="h-24 w-48 animate-pulse rounded-2xl bg-[var(--muted)]" />
    </div>
  );
}

const CanvasView = dynamic(() => import("@/components/graph/CanvasView").then((m) => m.CanvasView), {
  ssr: false,
  loading: () => <CanvasSkeleton />,
});

type Props = {
  people: PersonInput[];
  relationships: RelationshipInput[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  lang: Lang;
  initialA: string | null;
  initialB: string | null;
};

function readStoredFirst(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeFirst(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode, etc.): the feature just doesn't remember.
  }
}

function pairQuery(a: string | null, b: string | null) {
  const qs = new URLSearchParams();
  if (a) qs.set("a", a);
  if (b) qs.set("b", b);
  return qs.toString();
}

/** The home canvas with the path applied (`/?from=&to=`). */
function treeHref(a: string | null, b: string | null) {
  if (!a || !b) return "/";
  return `/?${new URLSearchParams({ from: a, to: b }).toString()}`;
}

function Emphasised({ parts }: { parts: Segments }) {
  return (
    <>
      {parts.before}
      {parts.emphasis && <strong className="font-bold text-[var(--path)]">{parts.emphasis}</strong>}
      {parts.after}
    </>
  );
}

const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-floating)]";
// The active tab must read clearly: white pill, bolder text, path-coloured underline.
const tabClass =
  "min-h-[44px] rounded-lg text-sm data-[state=active]:bg-[var(--card)] data-[state=active]:font-semibold data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-[inset_0_-2px_0_var(--path),0_1px_2px_rgb(0_0_0/0.08)]";
const actionClass =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

export function RelationshipFinder({ people, relationships, nodes, edges, lang, initialA, initialB }: Props) {
  const [a, setA] = useState<string | null>(initialA);
  const [b, setB] = useState<string | null>(initialB);
  const [tab, setTab] = useState<"tree" | "steps">("tree");

  const pickable = useMemo(() => people.filter((p) => !p.is_placeholder), [people]);
  const ctx = useMemo(() => makeKinContext(people, relationships), [people, relationships]);

  const syncUrl = useCallback((nextA: string | null, nextB: string | null) => {
    const qs = pairQuery(nextA, nextB);
    // replaceState keeps the address shareable without re-running the server component
    // (which would re-fetch the whole family on every pick). Next.js syncs it with the router.
    window.history.replaceState(window.history.state, "", qs ? `/relationships?${qs}` : "/relationships");
  }, []);

  const update = useCallback(
    (nextA: string | null, nextB: string | null) => {
      setA(nextA);
      setB(nextB);
      storeFirst(nextA);
      syncUrl(nextA, nextB);
    },
    [syncUrl],
  );

  // Arriving without a first person (e.g. from a profile's "How are we related?"):
  // start from whoever you compared last time.
  useEffect(() => {
    if (initialA) {
      storeFirst(initialA);
      return;
    }
    const stored = readStoredFirst();
    if (stored && stored !== initialB && pickable.some((p) => p.id === stored)) {
      setA(stored);
      syncUrl(stored, initialB);
    }
    // Mount-only: the initial picks come from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pair = useMemo(() => ({ a, b }), [a, b]);
  const deferred = useDeferredValue(pair);
  const pending = deferred !== pair;
  const outcome = useMemo(() => relate(ctx, deferred.a, deferred.b), [ctx, deferred]);
  const view: RelationshipView | null = outcome.status === "found" ? outcome.view : null;

  // Everything derived from the answer reads the deferred pair, so the card, its
  // links and the tree always agree with each other (never a new link on an old answer).
  const nameA = deferred.a ? personName(ctx.byId.get(deferred.a), lang, true) : "";
  const nameB = deferred.b ? personName(ctx.byId.get(deferred.b), lang, true) : "";
  const personB = deferred.b ? ctx.byId.get(deferred.b) : undefined;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const announcement = pending
    ? t("Finding the connection…", "جارٍ البحث عن الصلة…")
    : view
      ? `${lang === "ar" ? view.oneLine.ar : view.oneLine.en}. ${(lang === "ar" ? view.explanation.ar : view.explanation.en) ?? ""}`
      : outcome.status === "same"
        ? t("That's the same person.", "هذا هو الشخص نفسه.")
        : outcome.status === "none"
          ? t(`No connection found between ${nameA} and ${nameB}.`, `لم نجد صلة بين ${nameA} و${nameB}.`)
          : "";

  async function copyLink() {
    const url = `${window.location.origin}/relationships?${pairQuery(deferred.a, deferred.b)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("Link copied", "تم نسخ الرابط"));
    } catch {
      toast.error(t("Couldn't copy the link", "تعذّر نسخ الرابط"));
    }
  }

  const enoughPeople = pickable.length >= 2;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 p-4 md:h-[calc(100svh-var(--topbar-h))] md:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] md:gap-6 md:p-6">
      {/* ── Finder panel ─────────────────────────────────────────────── */}
      <section aria-labelledby="finder-title" className="flex flex-col gap-4 md:-m-2 md:min-h-0 md:overflow-y-auto md:p-2">
        <header>
          <h1
            id="finder-title"
            className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--foreground)]"
            style={{ fontFamily: lang === "ar" ? "var(--font-arabic)" : "var(--font-display)" }}
          >
            {t("How are we related?", "ما صلة القرابة بيننا؟")}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {t(
              "Pick two people and we'll trace the shortest route between them through the family.",
              "اختر شخصين وسنتتبّع أقصر طريق يربط بينهما في العائلة.",
            )}
          </p>
        </header>

        <div className={cn(cardClass, "p-4")}>
          <PersonCombobox
            label={t("First person", "الشخص الأول")}
            people={pickable}
            value={a}
            onChange={(id) => update(id, b)}
            lang={lang}
          />

          <div className="my-3 flex items-center gap-3">
            <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
            <button
              type="button"
              onClick={() => update(b, a)}
              disabled={!a && !b}
              aria-label={t("Swap the two people", "تبديل الشخصين")}
              title={t("Swap the two people", "تبديل الشخصين")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden />
            </button>
            <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <PersonCombobox
            label={t("Second person", "الشخص الثاني")}
            people={pickable}
            value={b}
            onChange={(id) => update(a, id)}
            lang={lang}
          />
        </div>

        {/* Spoken once per change; the visible card below is not itself live. */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        {/* ── Result ─────────────────────────────────────────────────── */}
        <div className={cn(cardClass, "p-5")}>
          {pending && !view ? (
            <div role="status" aria-label={t("Finding the connection…", "جارٍ البحث عن الصلة…")} className="space-y-3">
              <div className="h-3 w-40 animate-pulse rounded bg-[var(--muted)]" />
              <div className="h-8 w-full animate-pulse rounded bg-[var(--muted)]" />
              <div className="h-8 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--muted)]" />
            </div>
          ) : view ? (
            <div aria-busy={pending} className={cn(pending && "opacity-60")}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--path)]">
                {t("Closest connection", "أقرب صلة")} · {stepsText(view.distance, lang)}
              </p>

              {lang === "ar" ? (
                <>
                  <h2 lang="ar" dir="rtl" className="mt-2 text-[28px] font-semibold leading-snug text-[var(--foreground)]" style={{ fontFamily: "var(--font-arabic)" }}>
                    <Emphasised parts={view.headline.ar} />
                  </h2>
                  <p lang="en" dir="ltr" className="mt-1 inline-block max-w-full text-base text-[var(--muted-foreground)]">
                    {view.oneLine.en}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-2 text-[30px] font-semibold leading-tight tracking-tight text-[var(--foreground)]" style={{ fontFamily: "var(--font-display)", fontOpticalSizing: "auto" }}>
                    <Emphasised parts={view.headline.en} />
                  </h2>
                  <p lang="ar" dir="rtl" className="mt-1.5 inline-block max-w-full text-xl text-[var(--muted-foreground)]" style={{ fontFamily: "var(--font-arabic)" }}>
                    {view.oneLine.ar}
                  </p>
                </>
              )}

              {(lang === "ar" ? view.explanation.ar : view.explanation.en) && (
                <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]">
                  {lang === "ar" ? view.explanation.ar : view.explanation.en}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={treeHref(deferred.a, deferred.b)}
                  className={cn(actionClass, "bg-[var(--primary)] text-[var(--primary-foreground)] shadow hover:bg-[var(--primary)]/90")}
                >
                  <Network className="h-4 w-4" aria-hidden />
                  {t("Show on the tree", "اعرض على الشجرة")}
                </Link>
                <button
                  type="button"
                  onClick={copyLink}
                  className={cn(actionClass, "border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  {t("Copy link", "انسخ الرابط")}
                </button>
                {personB && (
                  <Link
                    href={`/person/${personB.slug ?? personB.id}`}
                    className={cn(actionClass, "border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    {lang === "ar" ? `افتح ملف ${personName(personB, lang)}` : `Open ${personName(personB, lang)}'s profile`}
                  </Link>
                )}
              </div>
            </div>
          ) : outcome.status === "same" ? (
            <MessageBlock
              icon={<Users className="h-5 w-5" aria-hidden />}
              title={t("That's the same person", "هذا هو الشخص نفسه")}
              body={t(`Pick someone other than ${nameA} to compare with.`, `اختر شخصًا غير ${nameA} للمقارنة.`)}
            />
          ) : outcome.status === "none" ? (
            <MessageBlock
              icon={<GitFork className="h-5 w-5" aria-hidden />}
              title={t("No connection yet", "لا توجد صلة بعد")}
              body={t(
                `We couldn't find a connection between ${nameA} and ${nameB} yet. Adding parents or marriages will help.`,
                `لم نجد صلة بين ${nameA} و${nameB} حتى الآن. إضافة الوالدين أو الزواج ستساعد.`,
              )}
            />
          ) : enoughPeople ? (
            <MessageBlock
              icon={<Route className="h-5 w-5" aria-hidden />}
              title={t("Who are you curious about?", "عمّن تريد أن تعرف؟")}
              body={t(
                "Choose two people above to see how they're connected, step by step.",
                "اختر شخصين لترى كيف يرتبطان، خطوة بخطوة.",
              )}
            />
          ) : (
            <MessageBlock
              icon={<UserPlus className="h-5 w-5" aria-hidden />}
              title={t("Add a few more people first", "أضف بعض الأشخاص أولًا")}
              body={t(
                "You need at least two people in the tree to compare them.",
                "تحتاج إلى شخصين على الأقل في الشجرة لمقارنتهما.",
              )}
              action={
                <Link href="/person/new" className={cn(actionClass, "mt-3 border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")}>
                  {t("Add a person", "إضافة شخص")}
                </Link>
              }
            />
          )}
        </div>
      </section>

      {/* ── Tree / steps ─────────────────────────────────────────────── */}
      <section
        aria-label={t("The connection", "الصلة")}
        className={cn(cardClass, "flex min-h-[460px] flex-col overflow-hidden md:min-h-0")}
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "tree" | "steps")}
          dir={lang === "ar" ? "rtl" : "ltr"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-[var(--border)] p-2">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl p-1">
              <TabsTrigger value="tree" className={tabClass}>
                {t("On the tree", "على الشجرة")}
              </TabsTrigger>
              <TabsTrigger value="steps" className={tabClass}>
                {t("Step by step", "خطوة بخطوة")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tree" className="relative mt-0 min-h-0 flex-1">
            <div className="h-[60svh] min-h-[360px] md:absolute md:inset-0 md:h-auto md:min-h-0">
              {view ? (
                <div className="canvas-stage relative h-full overflow-hidden">
                  <CanvasView
                    initialNodes={nodes}
                    initialEdges={edges}
                    people={people}
                    lang={lang}
                    readOnly
                    guest={false}
                    highlight={view.highlight}
                  />
                </div>
              ) : (
                <EmptyPane lang={lang} pending={pending} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="steps" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {view ? (
              <StepList view={view} ctx={ctx} lang={lang} />
            ) : (
              <EmptyPane lang={lang} pending={pending} />
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function MessageBlock({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">{icon}</span>
      <div>
        <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">{body}</p>
        {action}
      </div>
    </div>
  );
}

function EmptyPane({ lang, pending }: { lang: Lang; pending: boolean }) {
  return (
    <div className="canvas-stage flex h-full min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card)] text-[var(--path)] shadow-[var(--shadow-floating)]">
        <Route className="h-6 w-6" aria-hidden />
      </span>
      <p className="max-w-xs text-sm leading-relaxed text-[var(--muted-foreground)]">
        {pending
          ? lang === "ar" ? "جارٍ البحث عن الصلة…" : "Finding the connection…"
          : lang === "ar" ? "سيظهر المسار بين الشخصين هنا." : "The path between the two people will appear here."}
      </p>
    </div>
  );
}
