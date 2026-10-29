"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/members/primitives";
import { pinMessage } from "@/lib/auth/pin-validation";
import { checkDobParts, MONTH_NAMES, partsFromIso, yearOptions, type DobParts } from "@/lib/validation/dob";

type Props = {
  lang: "ar" | "en";
  /** YYYY-MM-DD, or "" while incomplete/invalid. Only read for the starting value. */
  value: string;
  /** Called with a valid YYYY-MM-DD, or "" whenever the date is incomplete or impossible. */
  onChange: (iso: string) => void;
  disabled?: boolean;
  hint?: string;
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Date of birth as three dropdowns (day / month / year): easier than a native
 * date picker for a grandparent scrolling back to 1950. Impossible dates (31
 * Feb, 29 Feb in a non-leap year) are flagged and reported to the form as "".
 */
export function DobSelect({ lang, value, onChange, disabled, hint }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [parts, setParts] = useState<DobParts>(() => partsFromIso(value));
  const years = yearOptions();

  const check = checkDobParts(parts);
  const error = check.status === "invalid" ? pinMessage(check.code, lang) : null;

  function update(next: DobParts) {
    setParts(next);
    const c = checkDobParts(next);
    onChange(c.status === "ok" ? c.iso : "");
  }

  const describedBy = [error ? `${uid}-err` : null, hint ? `${uid}-hint` : null].filter(Boolean).join(" ") || undefined;
  const selectClass = cn(fieldClass, "px-3");
  const labelClass = "text-xs font-medium text-[var(--muted-foreground)]";

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="mb-1.5 p-0 text-sm font-semibold">{t("Date of birth", "تاريخ الميلاد")}</legend>
      <div className="grid grid-cols-[1fr_1.7fr_1.2fr] gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-day`} className={labelClass}>
            {t("Day", "اليوم")}
          </label>
          <select
            id={`${uid}-day`}
            name="bday-day"
            autoComplete="bday-day"
            required
            value={parts.day}
            onChange={(e) => update({ ...parts, day: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={selectClass}
          >
            <option value="">{t("Day", "اليوم")}</option>
            {DAYS.map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-month`} className={labelClass}>
            {t("Month", "الشهر")}
          </label>
          <select
            id={`${uid}-month`}
            name="bday-month"
            autoComplete="bday-month"
            required
            value={parts.month}
            onChange={(e) => update({ ...parts, month: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={selectClass}
          >
            <option value="">{t("Month", "الشهر")}</option>
            {MONTH_NAMES[lang].map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-year`} className={labelClass}>
            {t("Year", "السنة")}
          </label>
          <select
            id={`${uid}-year`}
            name="bday-year"
            autoComplete="bday-year"
            required
            value={parts.year}
            onChange={(e) => update({ ...parts, year: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={selectClass}
          >
            <option value="">{t("Year", "السنة")}</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p id={`${uid}-err`} role="alert" className="mt-1.5 text-sm font-medium text-[var(--destructive)]">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${uid}-hint`} className="mt-1.5 text-xs text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
