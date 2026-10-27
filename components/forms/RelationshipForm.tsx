"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import { getDisplayName } from "@/lib/utils";

type PersonOption = {
  id?: string;
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
};

type Props = {
  people: PersonOption[];
  lang: "ar" | "en";
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
};

const selectClass =
  "h-11 w-full rounded-full border border-transparent bg-[var(--input)] px-4 text-[15px] text-[var(--foreground)] outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:border-[var(--primary)] focus-visible:bg-[var(--card)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

function SubmitButton({ lang }: { lang: "ar" | "en" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50 sm:w-auto"
    >
      {pending ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…") : lang === "ar" ? "إضافة العلاقة" : "Add relationship"}
    </button>
  );
}

export function RelationshipForm({ people, lang, action }: Props) {
  const [state, formAction] = useActionState(action, null);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p role="alert" className="rounded-2xl bg-[var(--destructive)]/10 px-4 py-2 text-sm text-[var(--destructive)]">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="rounded-2xl bg-[#E3EEDF] px-4 py-2 text-sm text-[#2F5A27]">
          {t("Added. The tree is updated.", "تمت الإضافة وتحدّثت الشجرة.")}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="rel_other_person" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            {t("Person", "الشخص")}
          </label>
          <select id="rel_other_person" name="other_person_id" required className={selectClass}>
            <option value="">{t("Choose someone…", "اختر شخصًا…")}</option>
            {people.filter((p) => p.id).map((p) => (
              <option key={p.id} value={p.id}>
                {getDisplayName(p, lang)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rel_type" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              {t("Relationship", "نوع العلاقة")}
            </label>
            <select id="rel_type" name="type" className={selectClass}>
              <option value="spouse">{t("Married to", "متزوج من")}</option>
              <option value="adopted_by">{t("Adopted by", "متبنّى من")}</option>
              <option value="raised_by">{t("Raised by", "تربّى على يد")}</option>
              <option value="godparent">{t("Godparent is", "العرّاب هو")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="rel_status" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              {t("Status", "الحالة")}
            </label>
            <select id="rel_status" name="status" className={selectClass}>
              <option value="current">{t("Current", "حالية")}</option>
              <option value="divorced">{t("Divorced", "طلاق")}</option>
              <option value="widowed">{t("Widowed", "ترمّل")}</option>
            </select>
          </div>
        </div>
        <SubmitButton lang={lang} />
      </div>
    </form>
  );
}
