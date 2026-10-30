"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, ExternalLink, GripVertical, MoreHorizontal, Pencil, Plus, Waypoints, X } from "lucide-react";
import { cn, getDisplayName, getNameParts } from "@/lib/utils";
import { avatarTone, initialsOf, lifeYears } from "@/lib/people/display";
import { AvatarPhotoUpload } from "@/components/forms/AvatarPhotoUpload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deletePersonCanvas, linkSpouse } from "@/lib/actions/people";
import { saveChildrenOrder } from "@/lib/actions/canvas";
import { compareByBirth } from "@/lib/graph/units";
import { familyView, halfSiblingHeading, marriageName, type FamilyUnitView } from "@/lib/graph/family-view";
import { useMediaQuery, DESKTOP_QUERY } from "@/lib/client/use-media-query";
import { familyTitle, relativeNoun, type PartnerStatus, type RelativeSlot } from "@/lib/people/relative-copy";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";
import { AddRelative } from "./AddRelative";
import { linkExistingRelative, removeRelative, setPartnerStatus, sharedParents } from "./link-actions";
import { moveItem, useDragReorder } from "./use-drag-reorder";
import { useRole } from "@/components/providers/role-provider";

export type FamilyHubProps = {
  person: PersonInput | null;
  /** Open straight into "+ Add {slot}" (from a dashed placeholder). */
  slot: RelativeSlot | null;
  /** Bumped on every placeholder click so the same slot can be reopened. */
  slotNonce: number;
  people: PersonInput[];
  relationships: RelationshipInput[];
  lang: "ar" | "en";
  canEdit: boolean;
  meId: string | null;
  onClose: () => void;
  /** Select someone else on the tree (their family opens here). */
  onShowPerson: (personId: string) => void;
};

/**
 * "{Name}'s family": who's who around the selected person, with slots to add or
 * fix relatives. Replaces line-dragging. A side panel on desktop (the tree stays
 * usable beside it) and a focus-trapped bottom sheet on phones. Viewers get the
 * same panel read-only.
 */
export function FamilyHub(props: FamilyHubProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const { person, lang, onClose } = props;
  if (!person) return null;
  const body = <HubBody key={`${person.id}:${props.slotNonce}`} {...props} person={person} inDialog={!desktop} />;

  if (desktop) {
    return (
      <aside
        aria-labelledby="family-hub-title"
        dir={lang === "ar" ? "rtl" : "ltr"}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            e.stopPropagation();
            onClose();
          }
        }}
        className="scrollbar-thin absolute inset-y-3 end-3 z-30 flex w-[min(380px,calc(100%-1.5rem))] flex-col overflow-y-auto rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_28px_rgba(36,21,23,0.10)]"
      >
        {body}
      </aside>
    );
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(36_21_23/0.45)]" />
        <DialogPrimitive.Content
          dir={lang === "ar" ? "rtl" : "ltr"}
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88svh] flex-col overflow-y-auto rounded-t-[28px] bg-[var(--card)] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-2.5 shadow-[var(--shadow-deep)] focus:outline-none"
        >
          <span aria-hidden className="mx-auto mb-2 h-[5px] w-11 shrink-0 rounded-full bg-[var(--border-strong)]" />
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type View = { kind: "overview" } | { kind: "add"; slot: RelativeSlot; replace?: { previous: PersonInput; relationshipId?: string | null; status?: PartnerStatus } };
type Confirm = { slot: RelativeSlot; other: PersonInput; relationshipId?: string | null; label: string } | null;
/** Where a child sits in the birth-order list, for the "Move older / younger" menu items. */
type OrderSlot = { index: number; count: number; move: (to: number) => void };

const sectionTitle = "mb-2 text-xs font-bold uppercase tracking-[0.05em] text-[var(--muted-foreground)]";
const linkPill =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-3.5 text-[13px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

function HubBody({
  person,
  slot,
  people,
  relationships,
  lang,
  canEdit,
  meId,
  onClose,
  onShowPerson,
  inDialog,
}: FamilyHubProps & { person: PersonInput; inDialog: boolean }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<View>(slot && canEdit ? { kind: "add", slot } : { kind: "overview" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const fv = useMemo(() => familyView(person.id, people, relationships), [person.id, people, relationships]);

  const given = getNameParts(person, lang).given || getDisplayName(person, lang);
  const fullName = getDisplayName(person, lang);
  const title = person.is_placeholder ? t("Unknown parent", "والد غير معروف") : familyTitle(given, lang);
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;

  const { children, siblings, exclude } = useMemo(() => {
    const partners = (fv?.unions ?? []).filter((u) => u.partner).map((u) => u.partner!);
    const children = fv ? [...fv.unions.flatMap((u) => u.children), ...fv.soloChildren] : [];
    const siblings = fv ? fv.siblingGroups.flatMap((g) => g.members) : [];
    // People already linked are not offered again in "Already in the tree".
    const exclude = new Set<string>([person.id]);
    for (const p of [fv?.father?.person, fv?.mother?.person, ...partners, ...children, ...siblings]) if (p) exclude.add(p.id);
    return { children, siblings, exclude };
  }, [person.id, fv]);

  // "Is it Rania?" — when one parent is known and has exactly one current partner of the right gender.
  const suggestFor = (missing: "father" | "mother"): string | null => {
    const known = missing === "mother" ? fv?.father : fv?.mother;
    if (!known) return null;
    // Only when the known parent has exactly one partner, and they fit the slot.
    const withPartner = known.otherUnions.filter((u) => u.partner && !u.partner.is_placeholder);
    if (withPartner.length !== 1) return null;
    const p = withPartner[0].partner!;
    return (missing === "mother" ? p.gender === "f" : p.gender !== "f") ? p.id : null;
  };
  const [dismissed, setDismissed] = useState<("father" | "mother")[]>([]);

  // Children oldest first (birth order set by hand, then birth date, then name),
  // across every marriage, so the whole list can be put in birth order.
  const childRows = useMemo(() => {
    if (!fv) return [];
    const rows = [
      ...fv.unions.flatMap((u) => u.children.map((c) => ({ person: c, partner: u.partner }))),
      ...fv.soloChildren.map((c) => ({ person: c, partner: null as PersonInput | null })),
    ];
    return rows.sort((x, y) => compareByBirth(x.person, y.person));
  }, [fv]);
  const { canEditPerson, canDeletePerson } = useRole();
  // Birth order is saved for every child at once, so all of them must be editable.
  const canSort = canEdit && childRows.length > 1 && childRows.every((r) => canEditPerson(r.person.id));
  // Optimistic order while saving; dropped as soon as fresh data arrives (new childRows).
  const [saved, setSaved] = useState<{ base: typeof childRows; ids: string[] } | null>(null);
  const orderIds = saved && saved.base === childRows ? saved.ids : childRows.map((r) => r.person.id);
  const [announce, setAnnounce] = useState("");

  function saveOrder(next: string[], movedId: string) {
    setSaved({ base: childRows, ids: next });
    const moved = childRows.find((r) => r.person.id === movedId)?.person;
    const pos = next.indexOf(movedId) + 1;
    const name = moved ? getNameParts(moved, lang).given || getDisplayName(moved, lang) : "";
    setAnnounce(
      pos === 1
        ? t(`${name} is now the oldest`, `${name} الآن الأكبر`)
        : pos === next.length
          ? t(`${name} is now the youngest`, `${name} الآن الأصغر`)
          : t(`${name} moved to ${pos} of ${next.length}`, `${name} في المرتبة ${pos} من ${next.length}`),
    );
    startTransition(async () => {
      const r = await saveChildrenOrder(person.id, next);
      if (r.success) router.refresh();
      else {
        setSaved(null);
        setAnnounce("");
        fail(r.error);
      }
    });
  }
  const moveChild = (id: string, to: number) => {
    const from = orderIds.indexOf(id);
    if (from < 0 || to === from || to < 0 || to >= orderIds.length) return;
    saveOrder(moveItem(orderIds, from, to), id);
  };
  const reorder = useDragReorder(orderIds, saveOrder, (id, delta) => moveChild(id, orderIds.indexOf(id) + delta));

  function acceptSuggestion(missing: "father" | "mother", parent: PersonInput) {
    startTransition(async () => {
      const r = await linkExistingRelative(person, missing, parent);
      if (r.success) done(lang === "ar" ? "تمت إضافة الوالد" : `${getNameParts(parent, lang).given} is now ${given}'s ${missing}`);
      else fail(r.error);
    });
  }

  function done(message: string) {
    toast.success(message);
    setView({ kind: "overview" });
    router.refresh();
  }

  function fail(error?: string) {
    toast.error(lang === "ar" ? "تعذّر الحفظ. حاول مرة أخرى." : error ?? "Couldn't save. Please try again.");
  }

  function changeStatus(u: FamilyUnitView, next: PartnerStatus) {
    if (!u.relationshipId || next === u.status) return;
    startTransition(async () => {
      const r = await setPartnerStatus(u.relationshipId!, next);
      if (r.success) done(t("Status updated", "تم تحديث الحالة"));
      else fail(r.error);
    });
  }

  function recordMarried(partner: PersonInput) {
    startTransition(async () => {
      const r = await linkSpouse(person.id, partner.id, "current");
      if (r.success) done(t("Recorded as married", "تم تسجيلهما متزوجين"));
      else fail(r.error);
    });
  }

  function runRemove() {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    startTransition(async () => {
      if (person.is_placeholder && c.other.id === person.id) {
        const r = await deletePersonCanvas(person.id);
        if (r.success) {
          toast.success(t("Placeholder removed", "تمت إزالة البطاقة"));
          onClose();
          router.refresh();
        } else fail(r.error);
        return;
      }
      const r = await removeRelative(person, c.slot, c.other, c.relationshipId);
      if (r.success) done(t("Link removed", "تمت إزالة الرابط"));
      else fail(r.error);
    });
  }

  const menuFor = (slotKind: RelativeSlot, other: PersonInput, unit?: FamilyUnitView, order?: OrderSlot) => {
    // Changing a link edits the relative too, so they must be in the member's close family as well.
    if (!canEdit || !canEditPerson(other.id)) return null;
    const otherName = getDisplayName(other, lang);
    const noun = relativeNoun(slotKind, other.gender, lang, unit?.status ?? "current");
    const removeLabel =
      slotKind === "sibling"
        ? t(
            `Remove ${otherName} as ${given}'s ${noun}? Siblings are linked through shared parents, so ${otherName} will no longer have ${sharedParents(person, other).map((id) => getDisplayName(people.find((p) => p.id === id), lang)).join(" and ")} as parents. Nobody is deleted.`,
            `إزالة ${otherName} من إخوة ${given}؟ يرتبط الإخوة عبر الوالدين، لذلك لن يُسجَّل ${sharedParents(person, other).map((id) => getDisplayName(people.find((p) => p.id === id), lang)).join(" و")} والدين لـ${otherName}. لن يُحذف أحد.`,
          )
        : slotKind === "partner"
          ? t(`Remove the marriage between ${given} and ${otherName}? Both stay on the tree.`, `إزالة الزواج بين ${given} و${otherName}؟ يبقى الاثنان في الشجرة.`)
          : t(`Remove ${otherName} as ${given}'s ${noun}? Both stay on the tree; only this link is removed.`, `إزالة ${otherName} بوصفه ${noun} لـ${given}؟ يبقى الاثنان في الشجرة، ويُزال هذا الرابط فقط.`);
    return (
      <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={t(`Options for ${otherName}`, `خيارات ${otherName}`)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem asChild>
            <Link href={`/person/${other.slug ?? other.id}`}>{t("Open profile", "فتح الملف")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onShowPerson(other.id)}>{t("Show their family", "عرض عائلته")}</DropdownMenuItem>
          {order && order.count > 1 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-[var(--muted-foreground)]">{t("Birth order", "ترتيب الولادة")}</DropdownMenuLabel>
              {order.index > 0 && (
                <>
                  <DropdownMenuItem onSelect={() => order.move(order.index - 1)}>{t("Move up (older)", "نقل للأعلى (أكبر)")}</DropdownMenuItem>
                  {order.index > 1 && <DropdownMenuItem onSelect={() => order.move(0)}>{t("Make oldest", "اجعله الأكبر")}</DropdownMenuItem>}
                </>
              )}
              {order.index < order.count - 1 && (
                <>
                  <DropdownMenuItem onSelect={() => order.move(order.index + 1)}>{t("Move down (younger)", "نقل للأسفل (أصغر)")}</DropdownMenuItem>
                  {order.index < order.count - 2 && <DropdownMenuItem onSelect={() => order.move(order.count - 1)}>{t("Make youngest", "اجعله الأصغر")}</DropdownMenuItem>}
                </>
              )}
            </>
          )}
          {slotKind === "partner" && unit && !unit.implicit && unit.relationshipId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-[var(--muted-foreground)]">{t("They are", "العلاقة")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={unit.status} onValueChange={(v) => changeStatus(unit, v as PartnerStatus)}>
                <DropdownMenuRadioItem value="current">{t("Married", "متزوجان")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="divorced">{t("Divorced", "مطلّقان")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="widowed">{t("Widowed", "ترمّل")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </>
          )}
          {slotKind === "partner" && unit?.implicit && (
            <DropdownMenuItem onSelect={() => recordMarried(other)}>{t("Record as married", "تسجيلهما متزوجين")}</DropdownMenuItem>
          )}
          {!(slotKind === "partner" && unit?.implicit) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  setView({ kind: "add", slot: slotKind, replace: { previous: other, relationshipId: unit?.relationshipId, status: unit?.status } })
                }
              >
                {t("Change (pick someone else)", "تغيير (اختر شخصًا آخر)")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setConfirm({ slot: slotKind, other, relationshipId: unit?.relationshipId, label: removeLabel })}
                className="text-[var(--destructive)] focus:text-[var(--destructive)]"
              >
                {t("Remove link", "إزالة الرابط")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const TitleTag = inDialog ? DialogPrimitive.Title : "h2";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {canEdit && !person.is_placeholder ? (
          <AvatarPhotoUpload
            personId={person.id}
            currentUrl={person.photo_url}
            alt={fullName}
            initials={initialsOf(person, lang)}
            fallbackGender={person.gender}
            sizeClass="h-14 w-14"
            lang={lang}
          />
        ) : (
          <MiniAvatar person={person} lang={lang} size={56} />
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <TitleTag id="family-hub-title" tabIndex={-1} className="font-heading text-[22px] font-bold leading-tight text-[var(--foreground)] focus:outline-none">
            {title}
          </TitleTag>
          <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)]">
            {person.is_placeholder
              ? t("Someone we know existed but haven't named yet.", "شخص نعرف بوجوده لكن لم نسجّل اسمه بعد.")
              : canEdit
                ? t("Add or fix who's who. No lines to drag.", "أضف أو صحّح صلات القرابة، بلا خطوط للسحب.")
                : t(`Who's who around ${given}.`, `صلات القرابة حول ${given}.`)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close the family panel", "إغلاق لوحة العائلة")}
          className="-me-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {view.kind === "add" && canEdit ? (
        <AddRelative
          subject={person}
          slot={view.slot}
          people={people}
          lang={lang}
          partnerUnions={fv?.unions ?? []}
          excludeIds={exclude}
          replace={view.replace}
          suggestedId={view.replace ? null : view.slot === "father" || view.slot === "mother" ? suggestFor(view.slot) : null}
          onBack={() => setView({ kind: "overview" })}
          onDone={done}
          onSwitchSlot={(s) => setView({ kind: "add", slot: s })}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {person.is_placeholder ? (
              canEdit && (
                <>
                  <Link href={`/person/${person.slug ?? person.id}/edit`} className={linkPill}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    {t("Fill in their details", "أكمل بياناته")}
                  </Link>
                  {canDeletePerson(person) && <button type="button" className={cn(linkPill, "text-[var(--destructive)]")} onClick={() => setConfirm({ slot: "child", other: person, label: t("Remove this placeholder card? Their children keep their other links.", "إزالة هذه البطاقة؟ يحتفظ الأبناء بروابطهم الأخرى.") })}>
                    {t("Remove placeholder", "إزالة البطاقة")}
                  </button>}
                </>
              )
            ) : (
              <>
                <Link href={`/person/${person.slug ?? person.id}`} className={linkPill}>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {t("Open profile", "فتح الملف")}
                </Link>
                {person.id !== meId && (
                  <Link
                    href={`/relationships?${new URLSearchParams(meId ? { a: meId, b: person.id } : { b: person.id }).toString()}`}
                    className={linkPill}
                  >
                    <Waypoints className="h-4 w-4" aria-hidden />
                    {t("How are we related?", "ما صلة القرابة بيننا؟")}
                  </Link>
                )}
                {canEdit && (
                  <Link href={`/person/${person.slug ?? person.id}/edit`} className={linkPill}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    {t("Edit details", "تعديل البيانات")}
                  </Link>
                )}
              </>
            )}
          </div>

          {fv && !person.is_placeholder && (
            <>
              <section aria-labelledby="hub-parents">
                <h3 id="hub-parents" className={sectionTitle}>{t("Parents", "الوالدان")}</h3>
                <div className="flex flex-col gap-2">
                  {(["father", "mother"] as const).map((s) => {
                    const pv = s === "father" ? fv.father : fv.mother;
                    if (pv) {
                      return (
                        <Row key={s} person={pv.person} lang={lang} sub={relativeNoun(s, pv.person.gender, lang)} menu={menuFor(s, pv.person)} chevron={Chevron} />
                      );
                    }
                    if (!canEdit) return <EmptyRow key={s} text={s === "father" ? t("Father not recorded", "الأب غير مسجّل") : t("Mother not recorded", "الأم غير مسجّلة")} />;
                    const suggested = dismissed.includes(s) ? null : suggestFor(s);
                    const candidate = suggested ? people.find((p) => p.id === suggested) : undefined;
                    return (
                      <div key={s} className="flex flex-col gap-2">
                        {candidate && (
                          // A gentle nudge for older data: only a question, never an automatic change.
                          <div role="group" aria-label={t("Suggestion", "اقتراح")} className="rounded-2xl border border-[var(--border)] bg-[var(--primary-soft)] p-3">
                            <p className="text-[14px] font-semibold text-[var(--foreground)]">
                              {s === "mother"
                                ? t(`Is ${getNameParts(candidate, lang).given} also ${given}'s mother?`, `هل ${getNameParts(candidate, lang).given} أيضًا أمّ ${given}؟`)
                                : t(`Is ${getNameParts(candidate, lang).given} also ${given}'s father?`, `هل ${getNameParts(candidate, lang).given} أيضًا أبو ${given}؟`)}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button type="button" disabled={pending} onClick={() => acceptSuggestion(s, candidate)} className="inline-flex min-h-10 items-center rounded-full bg-[var(--primary)] px-4 text-[13px] font-bold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-50">
                                {t("Yes, add", "نعم، أضف")}
                              </button>
                              <button type="button" onClick={() => setDismissed((d) => [...d, s])} className={linkPill}>
                                {t("No", "لا")}
                              </button>
                            </div>
                          </div>
                        )}
                        <AddRow
                          label={s === "father" ? t("Add father", "أضف الأب") : t("Add mother", "أضف الأم")}
                          onClick={() => setView({ kind: "add", slot: s })}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="hub-partners">
                <h3 id="hub-partners" className={sectionTitle}>{t("Partners", "الأزواج")}</h3>
                <div className="flex flex-col gap-2">
                  {fv.unions.filter((u) => u.partner).map((u) => (
                    <Row
                      key={u.unionId}
                      person={u.partner!}
                      lang={lang}
                      sub={[relativeNoun("partner", u.partner!.gender, lang, u.status), u.ordinal && fv.unions.length > 1 ? marriageName(u.ordinal, lang) : ""].filter(Boolean).join(" · ")}
                      chip={u.implicit ? t("Co-parent", "والد مشترك") : u.status === "current" ? t("Married", "متزوجان") : u.status === "divorced" ? t("Divorced", "مطلّقان") : t("Widowed", "ترمّل")}
                      chipTone={u.status === "current" && !u.implicit ? "strong" : "soft"}
                      menu={menuFor("partner", u.partner!, u)}
                      chevron={Chevron}
                    />
                  ))}
                  {fv.unions.every((u) => !u.partner) && !canEdit && <EmptyRow text={t("No partner recorded", "لا يوجد زوج مسجّل")} />}
                  {canEdit && <AddRow label={t("Add partner", "أضف شريك الحياة")} onClick={() => setView({ kind: "add", slot: "partner" })} />}
                </div>
              </section>

              <section aria-labelledby="hub-children">
                <h3 id="hub-children" className={sectionTitle}>{t("Children", "الأبناء")}</h3>
                {canSort && (
                  <p id="hub-children-hint" className="mb-2 text-xs text-[var(--muted-foreground)]">
                    {t(
                      "Oldest at the top. Drag the handle, use the arrow keys on it, or the ••• menu. The tree shows them oldest to youngest, left to right.",
                      "الأكبر في الأعلى. اسحب المقبض، أو استخدم مفاتيح الأسهم عليه، أو قائمة •••. تعرضهم الشجرة من الأكبر إلى الأصغر، من اليسار إلى اليمين.",
                    )}
                  </p>
                )}
                <p aria-live="polite" className="sr-only">{announce}</p>
                <div className="flex flex-col gap-2">
                  {reorder.order.map((id, i) => {
                    const row = childRows.find((r) => r.person.id === id);
                    if (!row) return null;
                    const c = row.person;
                    const sortable = canSort;
                    const name = getDisplayName(c, lang);
                    return (
                      <Row
                        key={c.id}
                        rowRef={reorder.rowRef(c.id)}
                        style={reorder.rowStyle(c.id)}
                        lifted={reorder.draggingId === c.id}
                        person={c}
                        lang={lang}
                        sub={[relativeNoun("child", c.gender, lang), row.partner ? t(`with ${getNameParts(row.partner, lang).given}`, `من ${getNameParts(row.partner, lang).given}`) : ""].filter(Boolean).join(" · ")}
                        handle={
                          sortable ? (
                            <button
                              type="button"
                              aria-label={t(`Reorder ${name}, ${i + 1} of ${childRows.length}`, `ترتيب ${name}، ${i + 1} من ${childRows.length}`)}
                              aria-describedby="hub-children-hint"
                              {...reorder.handleProps(c.id)}
                              className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:cursor-grabbing"
                            >
                              <GripVertical className="h-5 w-5" aria-hidden />
                            </button>
                          ) : null
                        }
                        menu={menuFor("child", c, undefined, sortable ? { index: i, count: childRows.length, move: (to) => moveChild(c.id, to) } : undefined)}
                        chevron={Chevron}
                      />
                    );
                  })}
                  {children.length === 0 && !canEdit && <EmptyRow text={t("No children recorded", "لا يوجد أبناء مسجّلون")} />}
                  {canEdit && <AddRow label={t("Add child", "أضف ابنًا أو ابنة")} onClick={() => setView({ kind: "add", slot: "child" })} />}
                </div>
              </section>

              <section aria-labelledby="hub-siblings">
                <h3 id="hub-siblings" className={sectionTitle}>{t("Brothers & sisters", "الإخوة والأخوات")}</h3>
                <div className="flex flex-col gap-2">
                  {fv.siblingGroups.map((g, gi) => (
                    <div key={gi} className="flex flex-col gap-2">
                      {g.kind === "half" && (
                        <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                          {halfSiblingHeading(g.via!, g.ordinal ?? null, given, lang, person.id === meId)}
                        </p>
                      )}
                      {g.members.map((s) => (
                        <Row
                          key={s.id}
                          person={s}
                          lang={lang}
                          sub={g.kind === "half" ? (lang === "ar" ? (s.gender === "f" ? "أخت غير شقيقة" : "أخ غير شقيق") : s.gender === "f" ? "Half-sister" : s.gender === "m" ? "Half-brother" : "Half-sibling") : relativeNoun("sibling", s.gender, lang)}
                          menu={g.kind === "full" ? menuFor("sibling", s) : null}
                          chevron={Chevron}
                        />
                      ))}
                    </div>
                  ))}
                  {siblings.length === 0 && !canEdit && <EmptyRow text={t("No brothers or sisters recorded", "لا يوجد إخوة مسجّلون")} />}
                  {canEdit && <AddRow label={t("Add sibling", "أضف أخًا أو أختًا")} onClick={() => setView({ kind: "add", slot: "sibling" })} />}
                </div>
              </section>
            </>
          )}
        </>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle>{t("Remove this link?", "إزالة هذا الرابط؟")}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">{confirm?.label}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={linkPill}>
              {t("Keep it", "إبقاء")}
            </button>
            <button
              type="button"
              onClick={runRemove}
              className="inline-flex min-h-10 items-center rounded-full bg-[var(--destructive)] px-4 text-[13px] font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              {t("Remove link", "إزالة الرابط")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MiniAvatar({ person, lang, size = 36 }: { person: PersonInput; lang: "ar" | "en"; size?: number }) {
  const tone = avatarTone(person.id);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: Math.round(size * 0.34) }}
    >
      {person.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- small storage avatar
        <img src={person.photo_url} alt="" className="h-full w-full object-cover" />
      ) : person.is_placeholder ? (
        "?"
      ) : (
        initialsOf(person, lang)
      )}
    </span>
  );
}

function Row({
  person,
  lang,
  sub,
  chip,
  chipTone = "soft",
  menu,
  handle,
  rowRef,
  style,
  lifted,
  chevron: Chevron,
}: {
  person: PersonInput;
  lang: "ar" | "en";
  sub: string;
  chip?: string;
  chipTone?: "strong" | "soft";
  menu: React.ReactNode;
  /** Drag handle for reordering, shown at the start of the row. */
  handle?: React.ReactNode;
  rowRef?: (el: HTMLDivElement | null) => void;
  style?: React.CSSProperties;
  /** Being dragged: lift it above its neighbours. */
  lifted?: boolean;
  chevron: typeof ChevronRight;
}) {
  const name = person.is_placeholder ? (lang === "ar" ? "والد غير معروف" : "Unknown parent") : getDisplayName(person, lang);
  const years = lifeYears(person.birth_date, person.death_date, lang);
  return (
    <div
      ref={rowRef}
      style={style}
      className={cn(
        "flex min-h-[56px] items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)]",
        handle ? "ps-0.5" : "ps-2.5",
        lifted && "shadow-[0_8px_24px_rgba(36,21,23,0.18)]",
      )}
    >
      {handle}
      <Link
        href={`/person/${person.slug ?? person.id}`}
        className="flex min-h-[54px] min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <MiniAvatar person={person} lang={lang} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-[var(--foreground)]">{name}</span>
          <span className="block truncate text-xs text-[var(--muted-foreground)]">{[sub, years].filter(Boolean).join(" · ")}</span>
        </span>
        {chip && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
              chipTone === "strong" ? "bg-[var(--foreground)] text-white" : "border border-[var(--border-strong)] text-[var(--foreground)]",
            )}
          >
            {chip}
          </span>
        )}
        {!menu && <Chevron className="me-2 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />}
      </Link>
      {menu}
    </div>
  );
}

function AddRow({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border-2 border-dashed border-[#C9B8B3] bg-[var(--background)] px-2.5 text-start text-[14px] font-bold text-[var(--primary)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)]">
        <Plus className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs font-semibold text-[var(--muted-foreground)]">{hint}</span>}
      </span>
    </button>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[var(--background)] px-3 py-3 text-sm text-[var(--muted-foreground)]">{text}</p>;
}
