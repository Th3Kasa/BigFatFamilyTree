"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Network } from "lucide-react";
import { cn, getDisplayName, getNameParts } from "@/lib/utils";
import { lifeYears } from "@/lib/people/display";
import { familyView, halfSiblingHeading, marriageName, type FamilyUnitView, type ParentView } from "@/lib/graph/family-view";
import { relativeNoun, type RelativeSlot } from "@/lib/people/relative-copy";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";
import { SlotButton } from "@/components/graph/PersonNode";
import { MiniAvatar } from "./FamilyHub";

type Props = {
  focusId: string;
  /** People visited so far, oldest first (the last one is `focusId`). */
  trail: string[];
  people: PersonInput[];
  relationships: RelationshipInput[];
  lang: "ar" | "en";
  canEdit: boolean;
  meId: string | null;
  /** Re-focus the view on someone. */
  onFocus: (personId: string) => void;
  /** Open the family panel for the focused person, optionally at a "+ Add" slot. */
  onOpenHub: (slot: RelativeSlot | null) => void;
  /** Leave for the full tree, centred on this person. */
  onShowOnTree: (personId: string) => void;
};

const sectionTitle = "mb-2 text-xs font-bold uppercase tracking-[0.06em] text-[var(--muted-foreground)]";

/**
 * Family view: one person and their immediate family as clean cards, with no
 * free-floating lines. Parents (each parent's other marriages folded away),
 * the person, each of their marriages as its own block with that marriage's
 * children, then full and half siblings. Tapping anyone re-focuses on them.
 */
export function FamilyView({ focusId, trail, people, relationships, lang, canEdit, meId, onFocus, onOpenHub, onShowOnTree }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const fv = useMemo(() => familyView(focusId, people, relationships), [focusId, people, relationships]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const isMe = focusId === meId;

  // Re-focusing moves keyboard focus to the new person's name, and scrolls up.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("[data-family-scroll]")?.scrollTo({ top: 0 });
  }, [focusId]);

  if (!fv) {
    return <p className="p-6 text-center text-sm text-[var(--muted-foreground)]">{t("That person isn't on the tree.", "هذا الشخص غير موجود في الشجرة.")}</p>;
  }

  const p = fv.person;
  const given = getNameParts(p, lang).given || getDisplayName(p, lang);
  const years = lifeYears(p.birth_date, p.death_date, lang);
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;
  const unionsWithPartner = fv.unions.filter((u) => u.partner);

  return (
    <div data-family-scroll className="scrollbar-thin h-full overflow-y-auto bg-[var(--background)]">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-3 pb-24 pt-16 md:px-6 md:pt-[4.5rem]">
        {trail.length > 1 && (
          <nav aria-label={t("People you visited", "الأشخاص الذين زرتهم")}>
            <ol className="scrollbar-none flex items-center gap-1 overflow-x-auto text-[13px]">
              {trail.map((id, i) => {
                const person = byId.get(id);
                if (!person) return null;
                const last = i === trail.length - 1;
                return (
                  <li key={`${id}-${i}`} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <Chevron className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden />}
                    {last ? (
                      <span aria-current="page" className="px-1.5 font-bold text-[var(--foreground)]">
                        {getNameParts(person, lang).given || getDisplayName(person, lang)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onFocus(id)}
                        className="inline-flex min-h-9 items-center rounded-full px-2.5 font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        {getNameParts(person, lang).given || getDisplayName(person, lang)}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <section aria-labelledby="fv-parents">
          <h2 id="fv-parents" className={cn(sectionTitle, "text-center")}>{t("Parents", "الوالدان")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["father", "mother"] as const).map((slot) => {
              const pv = slot === "father" ? fv.father : fv.mother;
              return (
                <div key={slot} className="flex flex-col gap-2">
                  {pv ? (
                    <Tile person={pv.person} lang={lang} sub={relativeNoun(slot, pv.person.gender, lang)} onClick={() => onFocus(pv.person.id)} />
                  ) : canEdit ? (
                    <SlotButton slot={slot} lang={lang} onClick={() => onOpenHub(slot)} className="h-[112px] w-full flex-col" />
                  ) : (
                    <p className="flex h-[112px] items-center justify-center rounded-[18px] border border-dashed border-[var(--border-strong)] text-center text-[13px] text-[var(--muted-foreground)]">
                      {slot === "father" ? t("Father not recorded", "الأب غير مسجّل") : t("Mother not recorded", "الأم غير مسجّلة")}
                    </p>
                  )}
                  {pv?.otherUnions.map((u) => (
                    <OtherUnion key={u.unionId} parent={pv} unit={u} isMe={isMe} lang={lang} onFocus={onFocus} />
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <div aria-hidden className="mx-auto h-5 w-0.5 bg-[#B5A6A8]" />

        <section
          aria-labelledby="fv-person"
          className="flex flex-col items-center gap-2 rounded-3xl border-2 border-[var(--primary)] bg-[var(--card)] p-5 text-center shadow-[0_10px_30px_rgba(122,22,49,0.12)]"
        >
          <MiniAvatar person={p} lang={lang} size={88} />
          <h2 id="fv-person" ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-bold text-[var(--foreground)] focus:outline-none">
            {getDisplayName(p, lang)}
          </h2>
          <p className="-mt-1 text-sm text-[var(--muted-foreground)]">
            {[isMe ? t("That's you", "هذا أنت") : "", years].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Link
              href={`/person/${p.slug ?? p.id}`}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              {t("View profile", "عرض الملف")}
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={() => onOpenHub(null)}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {t("Edit family", "تعديل العائلة")}
              </button>
            )}
            <button
              type="button"
              onClick={() => onShowOnTree(p.id)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Network className="h-4 w-4" aria-hidden />
              {t("See on the full tree", "عرض في الشجرة الكاملة")}
            </button>
          </div>
        </section>

        {(unionsWithPartner.length > 0 || fv.soloChildren.length > 0 || canEdit) && (
          <section aria-labelledby="fv-marriages" className="flex flex-col gap-3">
            <h2 id="fv-marriages" className={sectionTitle}>
              {unionsWithPartner.length > 1 ? t("Marriages & children", "الزيجات والأبناء") : t("Partner & children", "شريك الحياة والأبناء")}
            </h2>
            {unionsWithPartner.map((u) => (
              <MarriageBlock key={u.unionId} unit={u} many={unionsWithPartner.length > 1} lang={lang} canEdit={canEdit} onFocus={onFocus} onOpenHub={onOpenHub} />
            ))}
            {fv.soloChildren.length > 0 && (
              <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-3">
                <p className="mb-2 text-[13px] font-semibold text-[var(--muted-foreground)]">{t("Children (other parent not recorded)", "أبناء (الوالد الآخر غير مسجّل)")}</p>
                <TileGrid people={fv.soloChildren} lang={lang} kin={(c) => relativeNoun("child", c.gender, lang)} onFocus={onFocus} />
              </div>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {!fv.hasCurrentPartner && <SlotButton slot="partner" lang={lang} onClick={() => onOpenHub("partner")} className="w-auto px-4" />}
                {unionsWithPartner.length === 0 && <SlotButton slot="child" lang={lang} onClick={() => onOpenHub("child")} className="w-auto px-4" />}
              </div>
            )}
          </section>
        )}

        {(fv.siblingGroups.length > 0 || canEdit) && (
          <section aria-labelledby="fv-siblings" className="flex flex-col gap-3">
            <h2 id="fv-siblings" className={sectionTitle}>{t("Brothers & sisters", "الإخوة والأخوات")}</h2>
            {fv.siblingGroups.map((g, i) => (
              <div key={i} className="flex flex-col gap-2">
                {g.kind === "half" && (
                  <p className="text-[13px] font-semibold text-[var(--muted-foreground)]">{halfSiblingHeading(g.via!, g.ordinal ?? null, given, lang, isMe)}</p>
                )}
                <TileGrid
                  people={g.members}
                  lang={lang}
                  kin={(s) =>
                    g.kind === "half"
                      ? lang === "ar" ? (s.gender === "f" ? "أخت غير شقيقة" : "أخ غير شقيق") : s.gender === "f" ? "Half-sister" : s.gender === "m" ? "Half-brother" : "Half-sibling"
                      : relativeNoun("sibling", s.gender, lang)
                  }
                  onFocus={onFocus}
                />
              </div>
            ))}
            {canEdit && <SlotButton slot="sibling" lang={lang} onClick={() => onOpenHub("sibling")} className="w-auto self-start px-4" />}
          </section>
        )}

        <p className="text-center text-[13px] text-[var(--muted-foreground)]">{t("Tap anyone to move to them.", "انقر على أي شخص للانتقال إليه.")}</p>
      </div>
    </div>
  );
}

function Tile({ person, lang, sub, onClick, size = "md" }: { person: PersonInput; lang: "ar" | "en"; sub: string; onClick: () => void; size?: "md" | "row" }) {
  const name = person.is_placeholder ? (lang === "ar" ? "والد غير معروف" : "Unknown parent") : getNameParts(person, lang).given || getDisplayName(person, lang);
  const years = lifeYears(person.birth_date, person.death_date, lang);
  if (size === "row") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${getDisplayName(person, lang)}, ${sub}`}
        className="flex min-h-[60px] w-full items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-start transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <MiniAvatar person={person} lang={lang} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-[var(--foreground)]">{name}</span>
          <span className="block truncate text-xs text-[var(--muted-foreground)]">{[sub, years].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${getDisplayName(person, lang)}, ${sub}`}
      className="flex h-[112px] w-full flex-col items-center justify-center gap-1 rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-2 transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <MiniAvatar person={person} lang={lang} size={48} />
      <span className="w-full truncate text-[14px] font-semibold text-[var(--foreground)]">{name}</span>
      <span className="-mt-0.5 w-full truncate text-xs text-[var(--muted-foreground)]">{sub}</span>
    </button>
  );
}

function TileGrid({ people, lang, kin, onFocus }: { people: PersonInput[]; lang: "ar" | "en"; kin: (p: PersonInput) => string; onFocus: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
      {people.map((c) => (
        <li key={c.id}>
          <Tile person={c} lang={lang} sub={kin(c)} onClick={() => onFocus(c.id)} size="row" />
        </li>
      ))}
    </ul>
  );
}

function MarriageBlock({
  unit,
  many,
  lang,
  canEdit,
  onFocus,
  onOpenHub,
}: {
  unit: FamilyUnitView;
  many: boolean;
  lang: "ar" | "en";
  canEdit: boolean;
  onFocus: (id: string) => void;
  onOpenHub: (slot: RelativeSlot | null) => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const partner = unit.partner!;
  const status = unit.implicit
    ? t("Co-parents", "والدان مشتركان")
    : unit.status === "current" ? t("Married", "متزوجان") : unit.status === "divorced" ? t("Divorced", "مطلّقان") : t("Widowed", "ترمّل");
  return (
    <div className={cn("rounded-[20px] border bg-[var(--card)] p-3", unit.status === "current" && !unit.implicit ? "border-[var(--border-strong)]" : "border-dashed border-[var(--border-strong)]")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {many && unit.ordinal && <span className="text-[13px] font-bold text-[var(--foreground)]">{marriageName(unit.ordinal, lang)}</span>}
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", unit.status === "current" && !unit.implicit ? "bg-[var(--foreground)] text-white" : "border border-[var(--border-strong)] text-[var(--foreground)]")}>
          {status}
        </span>
      </div>
      <Tile person={partner} lang={lang} sub={relativeNoun("partner", partner.gender, lang, unit.status)} onClick={() => onFocus(partner.id)} size="row" />
      {unit.children.length > 0 && (
        <div className="mt-3 border-s-2 border-[#C9B8B3] ps-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">
            {unit.children.length === 1 ? t("Their child", "ابنهما") : t(`Their ${unit.children.length} children`, `أبناؤهما (${unit.children.length})`)}
          </p>
          <TileGrid people={unit.children} lang={lang} kin={(c) => relativeNoun("child", c.gender, lang)} onFocus={onFocus} />
        </div>
      )}
      {canEdit && (
        <div className="mt-2">
          <SlotButton slot="child" lang={lang} onClick={() => onOpenHub("child")} className="h-11 w-auto px-3" />
        </div>
      )}
    </div>
  );
}

/** "Dad's other marriage (2 children)", folded until tapped. */
function OtherUnion({ parent, unit, isMe, lang, onFocus }: { parent: ParentView; unit: FamilyUnitView; isMe: boolean; lang: "ar" | "en"; onFocus: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pName = getNameParts(parent.person, lang).given;
  const who =
    lang === "ar"
      ? isMe ? (parent.slot === "father" ? "والدك" : "والدتك") : pName
      : isMe ? (parent.slot === "father" ? "Dad" : "Mum") : pName;
  const n = unit.children.length;
  const what = unit.partner
    ? lang === "ar" ? "زواج آخر" : "other marriage"
    : lang === "ar" ? "أبناء آخرون" : "other children";
  const count = n > 0 ? (lang === "ar" ? ` (${n === 1 ? "ابن واحد" : `${n} أبناء`})` : ` (${n} ${n === 1 ? "child" : "children"})`) : "";
  const label = lang === "ar" ? `${what} لـ${who}${count}` : `${who}'s ${what}${count}`;
  return (
    <div className="rounded-2xl bg-[var(--muted)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-3 text-start text-[12.5px] font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <span>{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-2 px-2 pb-2">
          {unit.partner && (
            <Tile person={unit.partner} lang={lang} sub={relativeNoun("partner", unit.partner.gender, lang, unit.status)} onClick={() => onFocus(unit.partner!.id)} size="row" />
          )}
          {unit.children.map((c) => (
            <Tile key={c.id} person={c} lang={lang} sub={lang === "ar" ? (c.gender === "f" ? "أخت غير شقيقة" : "أخ غير شقيق") : c.gender === "f" ? "Half-sister" : c.gender === "m" ? "Half-brother" : "Half-sibling"} onClick={() => onFocus(c.id)} size="row" />
          ))}
        </div>
      )}
    </div>
  );
}
