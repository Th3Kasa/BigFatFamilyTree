"use client";

import { useId } from "react";
import { fieldClass } from "@/components/members/primitives";
import { MIN_DOB } from "@/lib/validation/members";

export type Identity = { firstName: string; lastName: string; dob: string };

type Props = {
  lang: "ar" | "en";
  value: Identity;
  onChange: (next: Identity) => void;
  disabled?: boolean;
  /** Shown under the birthday field. */
  dobHint?: string;
};

/** First name, last name and date of birth: the "username" of a PIN account. */
export function IdentityFields({ lang, value, onChange, disabled, dobHint }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const todayLocal = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, viewer's timezone

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-first`} className="text-sm font-semibold">
          {t("First name", "الاسم الأول")}
        </label>
        <input
          id={`${uid}-first`}
          name="given-name"
          type="text"
          autoComplete="given-name"
          required
          maxLength={60}
          value={value.firstName}
          onChange={(e) => onChange({ ...value, firstName: e.target.value })}
          disabled={disabled}
          placeholder={t("e.g. Adel", "مثال: عادل")}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-last`} className="text-sm font-semibold">
          {t("Last name", "اسم العائلة")}
        </label>
        <input
          id={`${uid}-last`}
          name="family-name"
          type="text"
          autoComplete="family-name"
          required
          maxLength={60}
          value={value.lastName}
          onChange={(e) => onChange({ ...value, lastName: e.target.value })}
          disabled={disabled}
          placeholder={t("e.g. Mansour", "مثال: منصور")}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-dob`} className="text-sm font-semibold">
          {t("Date of birth", "تاريخ الميلاد")}
        </label>
        <input
          id={`${uid}-dob`}
          name="bday"
          type="date"
          autoComplete="bday"
          required
          min={MIN_DOB}
          max={todayLocal}
          value={value.dob}
          onChange={(e) => onChange({ ...value, dob: e.target.value })}
          disabled={disabled}
          aria-describedby={dobHint ? `${uid}-dob-hint` : undefined}
          className={fieldClass}
        />
        {dobHint ? (
          <p id={`${uid}-dob-hint`} className="text-xs text-[var(--muted-foreground)]">
            {dobHint}
          </p>
        ) : null}
      </div>
    </>
  );
}
