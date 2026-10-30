"use client";

import { useMemo } from "react";
import { decadeOf, type TimelinePost, type TimelineViewer } from "@/lib/timeline/types";
import { Composer } from "./Composer";
import { PostCard } from "./PostCard";

export type TimelinePerson = {
  id: string;
  slug: string | null;
  name: string;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
};

/** A life event card rendered by the page, placed on the timeline by its date. */
export type TimelineEvent = { id: string; dateValue: string | null; node: React.ReactNode };

type Item = { key: string; date: string | null; created: string; post?: TimelinePost; event?: TimelineEvent };

/**
 * Order: posts with no year first ("Recently shared", newest first), then
 * everything with a date, newest first, under a divider per decade. Life events
 * without a date go last.
 */
export function orderTimeline(posts: TimelinePost[], events: TimelineEvent[]) {
  const items: Item[] = [
    ...posts.map((p) => ({ key: `p:${p.id}`, date: p.dateValue, created: p.createdAt, post: p })),
    ...events.map((e) => ({ key: `e:${e.id}`, date: e.dateValue, created: "", event: e })),
  ];
  const recent = items.filter((i) => !i.date && i.post).sort((a, b) => (a.created < b.created ? 1 : -1));
  const dated = items.filter((i) => i.date).sort((a, b) => (a.date! < b.date! ? 1 : a.date! > b.date! ? -1 : a.created < b.created ? 1 : -1));
  const undatedEvents = items.filter((i) => !i.date && i.event);
  return { recent, dated, undatedEvents };
}

export function Timeline({
  personId,
  firstName,
  posts,
  events,
  viewer,
  people,
  photosEnabled,
  available,
  lang,
  emptyState,
}: {
  personId: string;
  firstName: string;
  posts: TimelinePost[];
  events: TimelineEvent[];
  viewer: TimelineViewer | null;
  people: TimelinePerson[];
  photosEnabled: boolean;
  available: boolean;
  lang: "ar" | "en";
  emptyState: React.ReactNode;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const { recent, dated, undatedEvents } = useMemo(() => orderTimeline(posts, events), [posts, events]);

  const render = (i: Item) =>
    i.post ? (
      viewer ? <PostCard key={i.key} post={i.post} viewer={viewer} profilePersonId={personId} people={byId} lang={lang} /> : null
    ) : (
      <div key={i.key}>{i.event!.node}</div>
    );

  // A decade divider before the first item of each decade.
  const firstOfDecade = new Set(dated.filter((i, k) => k === 0 || decadeOf(i.date) !== decadeOf(dated[k - 1].date)).map((i) => i.key));
  const empty = recent.length + dated.length + undatedEvents.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {viewer && available && (
        <Composer personId={personId} firstName={firstName} viewerName={viewer.name} people={people} photosEnabled={photosEnabled} lang={lang} />
      )}

      {empty ? (
        emptyState
      ) : (
        <ol className="flex flex-col gap-4" aria-label={t(`${firstName}'s timeline`, `الخط الزمني لـ${firstName}`)}>
          {recent.length > 0 && <Divider label={t("Recently shared", "أُضيف مؤخرًا")} />}
          {recent.map((i) => (
            <li key={i.key}>{render(i)}</li>
          ))}
          {dated.map((i) => {
            const d = decadeOf(i.date);
            return [
              firstOfDecade.has(i.key) ? <Divider key={`d:${d}`} label={lang === "ar" ? `عقد ${d}` : `${d}s`} /> : null,
              <li key={i.key}>{render(i)}</li>,
            ];
          })}
          {undatedEvents.length > 0 && <Divider label={t("Date not known", "التاريخ غير معروف")} />}
          {undatedEvents.map((i) => (
            <li key={i.key}>{render(i)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3 text-[13px] font-semibold text-[var(--muted-foreground)]">
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
      <span role="heading" aria-level={3}>{label}</span>
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
    </li>
  );
}
