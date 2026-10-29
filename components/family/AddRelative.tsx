"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Search, UserPlus } from "lucide-react";
import { cn, getDisplayName, getNameParts } from "@/lib/utils";
import { PersonCombobox } from "@/components/relationships/PersonCombobox";
import type { PersonInput } from "@/lib/graph/transform";
import {
  addTitle,
  changeLabel,
  confirmLabel,
  relativeNoun,
  type PartnerStatus,
  type RelativeSlot,
} from "@/lib/people/relative-copy";
import { addNewRelative, linkExistingRelative, parentSlots, replaceRelative, type NewPersonFields } from "./link-actions";
import { marriageName, type FamilyUnitView } from "@/lib/graph/family-view";

type Mode = "new" | "existing";

export type AddRelativeProps = {
  subject: PersonInput;
  slot: RelativeSlot;
  people: PersonInput[];
  lang: "ar" | "en";
  /** The subject's partnerships, offered as the other parent when adding a child. */
  partnerUnions: FamilyUnitView[];
  /** People who must not be offered (the subject, and relatives already linked). */
  excludeIds: Set<string>;
  /** "Change": swap this person for someone already in the tree. */
  replace?: { previous: PersonInput; relationshipId?: string | null; status?: PartnerStatus };
  /** Pre-picked person (e.g. Dad's wife suggested as Mum). */
  suggestedId?: string | null;
  onBack: () => void;
  onDone: (message: string) => void;
  /** Sibling flow without a parent: jump to adding a parent instead. */
  onSwitchSlot: (slot: RelativeSlot) => void;
};

const field =
  "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelCls = "mb-1 block text-[13px] font-semibold text-[var(--foreground)]";
const chip = (on: boolean) =>
  cn(
    "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
    on ? "bg-[var(--foreground)] text-white" : "border border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  );

function defaultGender(slot: RelativeSlot, subject: PersonInput): NewPersonFields["gender"] {
  if (slot === "father") return "m";
  if (slot === "mother") return "f";
  if (slot === "partner") return subject.gender === "m" ? "f" : subject.gender === "f" ? "m" : "unknown";
  return "unknown";
}

/** Family name to suggest: children and siblings usually share the father's line. */
function defaultFamily(slot: RelativeSlot, subject: PersonInput) {
  const takesName = slot === "father" || slot === "sibling" || (slot === "child" && subject.gender !== "f");
  return takesName ? { en: subject.family_name_en ?? "", ar: subject.family_name_ar ?? "" } : { en: "", ar: "" };
}

function candidatesFor(slot: RelativeSlot, subject: PersonInput, people: PersonInput[], exclude: Set<string>) {
  return people.filter((p) => {
    if (p.is_placeholder || p.id === subject.id || exclude.has(p.id)) return false;
    // Server actions choose the parent slot from the parent's gender, so only offer people who fit it.
    if (slot === "father") return p.gender !== "f";
    if (slot === "mother") return p.gender === "f";
    if (slot === "child") return !(subject.gender === "f" ? p.mother_id : p.father_id);
    return true;
  });
}

export function AddRelative(props: AddRelativeProps) {
  const { subject, slot, people, lang, partnerUnions: partnerUnionsAll, excludeIds, replace, suggestedId, onBack, onDone, onSwitchSlot } = props;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const subjectName = getNameParts(subject, lang).given || getDisplayName(subject, lang);
  const noParents = !subject.father_id && !subject.mother_id;
  const siblingNeedsParent = slot === "sibling" && noParents;
  const [mode, setMode] = useState<Mode>(replace || suggestedId || siblingNeedsParent ? "existing" : "new");
  const [pickedId, setPickedId] = useState<string | null>(suggestedId ?? null);
  const fam = defaultFamily(slot, subject);
  const [form, setForm] = useState<NewPersonFields>({
    given_en: "",
    given_ar: "",
    family_name_en: fam.en,
    family_name_ar: fam.ar,
    gender: defaultGender(slot, subject),
    birth_date: "",
  });
  const [status, setStatus] = useState<PartnerStatus>(replace?.status ?? "current");
  // The other parent defaults to the current marriage (or the only partner), shown as "Child of A & B".
  const partnerUnions = partnerUnionsAll.filter((u) => u.partner && !u.partner.is_placeholder);
  const currentUnion = [...partnerUnions].reverse().find((u) => u.status === "current" && !u.implicit) ?? (partnerUnions.length === 1 ? partnerUnions[0] : null);
  const [coParentId, setCoParentId] = useState<string | null>(currentUnion?.partner?.id ?? null);
  const [choosingParent, setChoosingParent] = useState(partnerUnions.length > 1 && !currentUnion);
  const [fatherId, setFatherId] = useState<string | null>(null);
  const givenOf = (p: PersonInput) => getNameParts(p, lang).given || getDisplayName(p, lang);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const candidates = useMemo(() => candidatesFor(slot, subject, people, excludeIds), [slot, subject, people, excludeIds]);
  const picked = pickedId ? people.find((p) => p.id === pickedId) ?? null : null;
  const coParent = coParentId ? partnerUnions.find((u) => u.partner!.id === coParentId)?.partner ?? null : null;
  const needsFatherChoice = !!coParent && !parentSlots(subject, coParent);

  const typedName = lang === "ar" ? form.given_ar || form.given_en : form.given_en || form.given_ar;
  const relativeName = mode === "existing" ? (picked ? getNameParts(picked, lang).given || getDisplayName(picked, lang) : null) : typedName;
  const relativeGender = mode === "existing" ? picked?.gender : form.gender;
  const cta = replace
    ? changeLabel(slot, subjectName, relativeName, relativeGender, lang, status)
    : confirmLabel(slot, subjectName, relativeName, relativeGender, lang, status);
  const valid =
    (mode === "existing" ? !!picked : !!(form.given_en.trim() || form.given_ar.trim()) && !siblingNeedsParent) &&
    !(slot === "child" && needsFatherChoice && !fatherId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    startTransition(async () => {
      const opts = { status, coParent, fatherId };
      const result = replace && picked
        ? await replaceRelative(subject, slot, replace.previous, picked, { relationshipId: replace.relationshipId, status })
        : mode === "existing" && picked
          ? await linkExistingRelative(subject, slot, picked, opts)
          : await addNewRelative(subject, slot, form, opts);
      if (result.success) {
        onDone(
          lang === "ar"
            ? `تم الحفظ: ${cta}`
            : `${relativeName} is now ${subjectName}'s ${relativeNoun(slot, relativeGender, "en", status)}`,
        );
      } else {
        setError(
          lang === "ar"
            ? "تعذّر حفظ الرابط. تأكّد من أن الخانة غير مشغولة ثم حاول مرة أخرى."
            : result.error ?? "Couldn't save that link. Please try again.",
        );
      }
    });
  }

  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const set = (k: keyof NewPersonFields) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const showGender = slot !== "father" && slot !== "mother";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-labelledby={`${uid}-title`} noValidate>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("Back to the family", "رجوع إلى العائلة")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Back className="h-5 w-5" aria-hidden />
        </button>
        <h3 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className="font-heading text-lg font-bold text-[var(--foreground)] focus:outline-none">
          {replace
            ? t(`Change ${subjectName}'s ${slot === "partner" ? "partner" : slot}`, `تغيير ${slot === "father" ? "الأب" : slot === "mother" ? "الأم" : slot === "partner" ? "شريك الحياة" : slot === "child" ? "الابن أو الابنة" : "الأخ أو الأخت"} لـ${subjectName}`)
            : addTitle(slot, subjectName, lang)}
        </h3>
      </div>

      {!replace && (
        <div role="group" aria-label={t("Who is it?", "من هو؟")} className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={mode === "new"}
            onClick={() => setMode("new")}
            className={cn(
              "flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              mode === "new" ? "border-2 border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]",
            )}
          >
            <UserPlus className="h-5 w-5" aria-hidden />
            {t("New person", "شخص جديد")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "existing"}
            onClick={() => setMode("existing")}
            className={cn(
              "flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              mode === "existing" ? "border-2 border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]",
            )}
          >
            <Search className="h-5 w-5" aria-hidden />
            {t("Already in the tree", "موجود في الشجرة")}
          </button>
        </div>
      )}

      {mode === "new" && siblingNeedsParent && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm leading-relaxed text-[var(--foreground)]">
          <p>
            {t(
              `Brothers and sisters are linked through a shared parent. Add ${subjectName}'s father or mother first, or pick someone already in the tree.`,
              `يرتبط الإخوة عبر أحد الوالدين. أضف أب ${subjectName} أو أمّه أولًا، أو اختر شخصًا موجودًا في الشجرة.`,
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={chip(false)} onClick={() => onSwitchSlot("father")}>
              {t("Add father", "أضف الأب")}
            </button>
            <button type="button" className={chip(false)} onClick={() => onSwitchSlot("mother")}>
              {t("Add mother", "أضف الأم")}
            </button>
          </div>
        </div>
      )}

      {mode === "new" && !siblingNeedsParent && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-ge`} className={labelCls}>
              {t("Given name (English)", "الاسم الأول (بالإنجليزية)")}
            </label>
            <input id={`${uid}-ge`} dir="ltr" lang="en" autoComplete="off" value={form.given_en} onChange={set("given_en")} className={field} aria-describedby={`${uid}-namehint`} />
          </div>
          <div>
            <label htmlFor={`${uid}-ga`} className={labelCls}>
              {t("Given name (Arabic, optional)", "الاسم الأول (بالعربية، اختياري)")}
            </label>
            <input id={`${uid}-ga`} dir="rtl" lang="ar" autoComplete="off" value={form.given_ar} onChange={set("given_ar")} className={field} />
          </div>
          <p id={`${uid}-namehint`} className="-mt-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
            {t("A name in either language is enough.", "يكفي الاسم بإحدى اللغتين.")}
          </p>
          <div>
            <label htmlFor={`${uid}-fe`} className={labelCls}>
              {t("Family name", "اسم العائلة (بالإنجليزية)")}
            </label>
            <input id={`${uid}-fe`} dir="ltr" lang="en" autoComplete="off" value={form.family_name_en} onChange={set("family_name_en")} className={field} />
          </div>
          <div>
            <label htmlFor={`${uid}-fa`} className={labelCls}>
              {t("Family name (Arabic, optional)", "اسم العائلة (بالعربية، اختياري)")}
            </label>
            <input id={`${uid}-fa`} dir="rtl" lang="ar" autoComplete="off" value={form.family_name_ar} onChange={set("family_name_ar")} className={field} />
          </div>
          {showGender && (
            <fieldset className="sm:col-span-2">
              <legend className={labelCls}>{t("Gender", "الجنس")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["m", "f", "unknown"] as const).map((g) => (
                  <button key={g} type="button" aria-pressed={form.gender === g} className={chip(form.gender === g)} onClick={() => setForm((f) => ({ ...f, gender: g }))}>
                    {g === "m" ? t("Male", "ذكر") : g === "f" ? t("Female", "أنثى") : t("Not sure", "غير محدد")}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-bd`} className={labelCls}>
              {t("Birth date (optional)", "تاريخ الميلاد (اختياري)")}
            </label>
            <input id={`${uid}-bd`} type="date" value={form.birth_date} onChange={set("birth_date")} className={field} />
          </div>
        </div>
      )}

      {mode === "existing" && (
        <div>
          <PersonCombobox
            label={t("Search the family", "ابحث في العائلة")}
            people={candidates}
            value={pickedId}
            onChange={setPickedId}
            lang={lang}
          />
          {(slot === "father" || slot === "mother") && (
            <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
              {slot === "father"
                ? t("Only men (or people without a gender set) are listed.", "يظهر الرجال فقط (أو من لم يُحدَّد جنسه).")
                : t("Only women are listed. Set someone's gender on their profile to see them here.", "تظهر النساء فقط. حدّد الجنس في الملف الشخصي ليظهر الشخص هنا.")}
            </p>
          )}
        </div>
      )}

      {slot === "partner" && (
        <div role="group" aria-label={t("They are", "العلاقة")} className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-[var(--muted-foreground)]" aria-hidden>
            {t("They are", "هما")}
          </span>
          {(["current", "divorced", "widowed"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} className={chip(status === s)} onClick={() => setStatus(s)}>
              {s === "current" ? t("Married", "متزوجان") : s === "divorced" ? t("Divorced", "مطلّقان") : t("Widowed", "ترمّل")}
            </button>
          ))}
        </div>
      )}

      {slot === "child" && !replace && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-[var(--foreground)]" aria-live="polite">
              {coParent
                ? t(`Child of ${subjectName} & ${givenOf(coParent)}`, `ابن ${subjectName} و${givenOf(coParent)}`)
                : t(`Child of ${subjectName} · other parent unknown`, `ابن ${subjectName} · الوالد الآخر غير معروف`)}
            </p>
            {partnerUnions.length > 0 && (
              <button type="button" aria-expanded={choosingParent} onClick={() => setChoosingParent((v) => !v)} className={chip(false)}>
                {t("Change", "تغيير")}
              </button>
            )}
          </div>
          {choosingParent && (
            <fieldset className="mt-3">
              <legend className={labelCls}>{t("Which marriage is this child from?", "من أيّ زواج هذا الابن؟")}</legend>
              <div className="flex flex-wrap gap-2">
                {partnerUnions.map((u) => (
                  <button key={u.unionId} type="button" aria-pressed={coParentId === u.partner!.id} className={chip(coParentId === u.partner!.id)} onClick={() => setCoParentId(u.partner!.id)}>
                    {getDisplayName(u.partner!, lang)}
                    {partnerUnions.length > 1 && (
                      <span className="ms-1 opacity-80">
                        {u.status === "current" && !u.implicit ? t("(current)", "(الحالي)") : u.ordinal ? `(${marriageName(u.ordinal, lang)})` : ""}
                      </span>
                    )}
                  </button>
                ))}
                <button type="button" aria-pressed={coParentId === null} className={chip(coParentId === null)} onClick={() => setCoParentId(null)}>
                  {t("Other parent unknown", "الوالد الآخر غير معروف")}
                </button>
              </div>
            </fieldset>
          )}
          {coParent && needsFatherChoice && (
            <fieldset className="mt-3">
              <legend className={labelCls}>{t("Who is the father?", "من هو الأب؟")}</legend>
              <div className="flex flex-wrap gap-2">
                {[subject, coParent].map((p) => (
                  <button key={p.id} type="button" aria-pressed={fatherId === p.id} className={chip(fatherId === p.id)} onClick={() => setFatherId(p.id)}>
                    {getDisplayName(p, lang)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!valid || pending}
        className="min-h-12 rounded-full bg-[var(--primary)] px-5 py-2.5 text-[15px] font-bold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("Saving…", "جارٍ الحفظ…") : cta}
      </button>
    </form>
  );
}
