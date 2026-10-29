"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addFamilyMember, type AddFamilyMemberState } from "@/lib/actions/members";
import { hasArabic, splitFullName } from "@/lib/members/match";
import type { PersonSummary } from "@/lib/members/types";
import { cn } from "@/lib/utils";
import { PersonCombobox } from "./PersonCombobox";
import { cardClass, fieldClass, pill, Spinner } from "./primitives";

/** A suggested relative the admin is adding to the tree (from the "Suggested relatives" tab). */
export type SuggestionPrefill = { suggestionId: string; name: string; relation: string; by: string };

type Props = {
  lang: "ar" | "en";
  people: PersonSummary[];
  prefill?: SuggestionPrefill | null;
  onClearPrefill?: () => void;
};

/** "Maya Haddad" -> given + family in the right script. */
function prefillValues(name: string): Record<string, string> {
  const { given, family } = splitFullName(name);
  return hasArabic(name)
    ? { given_ar: given, family_name_ar: family ?? "" }
    : { given_en: given, family_name_en: family ?? "" };
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the viewer's timezone

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#241517]">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--destructive)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Create a person who has no account (an elder, a child, someone who passed away). */
export function AddFamilyMemberForm({ lang, people, prefill = null, onClearPrefill }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pendingSubmit] = useActionState<AddFamilyMemberState, FormData>(
    addFamilyMember,
    null,
  );
  const [formKey, setFormKey] = useState(0);
  const [father, setFather] = useState<PersonSummary | null>(null);
  const [mother, setMother] = useState<PersonSummary | null>(null);
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  const handled = useRef<AddFamilyMemberState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message);
      const form = formRef.current;
      const name = form
        ? [form.given_en?.value || form.given_ar?.value, form.family_name_en?.value || form.family_name_ar?.value]
            .filter(Boolean)
            .join(" ")
        : "";
      setAdded({ id: state.personId, name });
      setFather(null);
      setMother(null);
      setFormKey((k) => k + 1); // fresh, empty form
      onClearPrefill?.(); // the suggestion (if any) is now handled
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router, onClearPrefill]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  // What the admin typed after a failed save wins over the suggestion's name.
  const v = { ...(prefill ? prefillValues(prefill.name) : {}), ...(state && !state.ok ? (state.values ?? {}) : {}) };

  return (
    <section aria-labelledby={`${uid}-h`} className={cn(cardClass, "p-5")}>
      <h2 id={`${uid}-h`} className="text-lg font-bold">
        {t("Add a family member", "أضف فردًا من العائلة")}
      </h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {t(
          "For someone who doesn't have an account, like a grandparent, a child, or a relative who has passed away. They can be linked to an account later.",
          "لشخص ليس لديه حساب، مثل جدّ أو طفل أو قريب توفي. يمكن ربطه بحساب لاحقًا.",
        )}
      </p>

      {added ? (
        <p role="status" className="mt-3 rounded-2xl bg-[#E3EEDF] px-4 py-3 text-sm text-[#2F5A27]">
          {t("Added", "تمت إضافة")} {added.name ? <strong>{added.name}</strong> : null}.{" "}
          <Link href={`/person/${added.id}`} className="font-semibold underline underline-offset-2">
            {t("Open profile", "افتح الملف الشخصي")}
          </Link>
        </p>
      ) : null}

      {prefill ? (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[#F7E7EB] px-4 py-3 text-sm text-[#5C0F24]">
          <span className="min-w-0 flex-1">
            {t(
              `Adding ${prefill.name} (${prefill.relation}), suggested by ${prefill.by}. Check the details, then save.`,
              `إضافة ${prefill.name} (${prefill.relation}) كما اقترح ${prefill.by}. راجع التفاصيل ثم احفظ.`,
            )}
          </span>
          {onClearPrefill ? (
            <button type="button" className={pill.ghost} onClick={onClearPrefill}>
              {t("Start blank", "ابدأ فارغًا")}
            </button>
          ) : null}
        </p>
      ) : null}

      <form key={`${formKey}:${prefill?.suggestionId ?? ""}`} ref={formRef} action={formAction} className="mt-5 flex max-w-2xl flex-col gap-5" noValidate>
        {prefill ? <input type="hidden" name="suggestion_id" value={prefill.suggestionId} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${uid}-gen`} label={t("First name (English)", "الاسم الأول (بالإنجليزية)")} error={errors.given_en}>
            <input
              id={`${uid}-gen`}
              name="given_en"
              defaultValue={v.given_en}
              dir="ltr"
              autoComplete="off"
              maxLength={120}
              aria-invalid={errors.given_en ? true : undefined}
              className={fieldClass}
            />
          </Field>
          <Field id={`${uid}-gar`} label={t("First name (Arabic)", "الاسم الأول (بالعربية)")} error={errors.given_ar}>
            <input
              id={`${uid}-gar`}
              name="given_ar"
              defaultValue={v.given_ar}
              dir="rtl"
              lang="ar"
              autoComplete="off"
              maxLength={120}
              className={fieldClass}
            />
          </Field>
          <Field id={`${uid}-fen`} label={t("Family name (English)", "اسم العائلة (بالإنجليزية)")} error={errors.family_name_en}>
            <input id={`${uid}-fen`} name="family_name_en" defaultValue={v.family_name_en} dir="ltr" autoComplete="off" maxLength={120} className={fieldClass} />
          </Field>
          <Field id={`${uid}-far`} label={t("Family name (Arabic)", "اسم العائلة (بالعربية)")} error={errors.family_name_ar}>
            <input id={`${uid}-far`} name="family_name_ar" defaultValue={v.family_name_ar} dir="rtl" lang="ar" autoComplete="off" maxLength={120} className={fieldClass} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${uid}-sex`} label={t("Gender", "الجنس")} error={errors.gender}>
            <select id={`${uid}-sex`} name="gender" defaultValue={v.gender || "unknown"} className={cn(fieldClass, "appearance-auto")}>
              <option value="unknown">{t("Not sure", "غير محدد")}</option>
              <option value="m">{t("Male", "ذكر")}</option>
              <option value="f">{t("Female", "أنثى")}</option>
            </select>
          </Field>
          <Field
            id={`${uid}-dob`}
            label={t("Date of birth", "تاريخ الميلاد")}
            hint={t("Leave blank if you don't know it.", "اتركه فارغًا إن كنت لا تعرفه.")}
            error={errors.birth_date}
          >
            <input
              id={`${uid}-dob`}
              name="birth_date"
              defaultValue={v.birth_date}
              type="date"
              min="1900-01-01"
              max={today()}
              aria-invalid={errors.birth_date ? true : undefined}
              className={fieldClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PersonCombobox
            people={people}
            lang={lang}
            label={t("Father (optional)", "الأب (اختياري)")}
            placeholder={t("Search the tree", "ابحث في الشجرة")}
            value={father}
            onChange={setFather}
            filter={(p) => p.gender !== "f"}
            name="father_id"
            error={errors.father_id}
          />
          <PersonCombobox
            people={people}
            lang={lang}
            label={t("Mother (optional)", "الأم (اختياري)")}
            placeholder={t("Search the tree", "ابحث في الشجرة")}
            value={mother}
            onChange={setMother}
            filter={(p) => p.gender !== "m"}
            name="mother_id"
            error={errors.mother_id}
          />
        </div>

        <div>
          <button type="submit" disabled={pendingSubmit} className={cn(pill.primary, "min-h-[52px] px-7 text-base")}>
            {pendingSubmit ? <Spinner /> : null}
            {pendingSubmit ? t("Adding…", "جارٍ الإضافة…") : t("Add to the family tree", "أضِف إلى شجرة العائلة")}
          </button>
        </div>
      </form>
    </section>
  );
}
