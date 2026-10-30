"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  composePartialDate,
  daysInMonth,
  MONTHS_AR,
  MONTHS_EN,
  parsePartialDate,
  type PartialDate,
} from "@/lib/people/partial-date";

type Props = {
  label: string;
  lang: "ar" | "en";
  /** Stored value: "", "1917", "1917-05" or "1917-05-12". */
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  /** Also submit the value in a plain form under this name. */
  name?: string;
  /** Classes for the three controls, to match the surrounding form. */
  inputClassName?: string;
  labelClassName?: string;
};

/**
 * Day, month and year as three controls, where only the year is required:
 * leave day and month blank when they aren't known ("1917"), or just the day
 * ("May 1917").
 */
export function PartialDateField({ label, lang, defaultValue, onChange, name, inputClassName, labelClassName }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [d, setD] = useState<PartialDate>(() => parsePartialDate(defaultValue));
  const [touched, setTouched] = useState(false);
  // A value in some older format is kept as it was until someone edits the date.
  const value = touched || parsePartialDate(defaultValue).year ? composePartialDate(d) : (defaultValue ?? "");
  const yearTyped = d.year !== "" && !/^\d{4}$/.test(d.year);
  const partNoYear = d.year === "" && (d.month !== "" || d.day !== "");

  const update = (patch: Partial<PartialDate>) => {
    const next = { ...d, ...patch };
    if (next.day && next.month && Number(next.day) > daysInMonth(next.year, next.month)) next.day = "";
    setD(next);
    setTouched(true);
    onChange?.(composePartialDate(next));
  };

  const days = d.month ? daysInMonth(d.year, d.month) : 31;
  const months = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  const control = cn(inputClassName, "min-w-0");
  const hintId = `${uid}-hint`;

  return (
    <fieldset className="min-w-0">
      <legend className={labelClassName}>{label}</legend>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <div className="min-w-0">
          <label htmlFor={`${uid}-d`} className="sr-only">
            {t(`${label}: day (optional)`, `${label}: اليوم (اختياري)`)}
          </label>
          <select id={`${uid}-d`} value={d.day} onChange={(e) => update({ day: e.target.value })} disabled={!d.month} aria-describedby={hintId} className={control}>
            <option value="">{t("Day", "اليوم")}</option>
            {Array.from({ length: days }, (_, i) => String(i + 1)).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-m`} className="sr-only">
            {t(`${label}: month (optional)`, `${label}: الشهر (اختياري)`)}
          </label>
          <select id={`${uid}-m`} value={d.month} onChange={(e) => update({ month: e.target.value, ...(e.target.value ? {} : { day: "" }) })} aria-describedby={hintId} className={control}>
            <option value="">{t("Month", "الشهر")}</option>
            {months.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-y`} className="sr-only">
            {t(`${label}: year`, `${label}: السنة`)}
          </label>
          <input
            id={`${uid}-y`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder={t("Year", "السنة")}
            value={d.year}
            onChange={(e) => update({ year: e.target.value.replace(/[^\d٠-٩]/g, "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))) })}
            aria-invalid={yearTyped || partNoYear || undefined}
            aria-describedby={hintId}
            dir="ltr"
            className={control}
          />
        </div>
      </div>
      <p id={hintId} className={cn("mt-1 text-xs", yearTyped || partNoYear ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]")}>
        {yearTyped
          ? t("Enter the year as 4 digits, like 1917.", "اكتب السنة بأربعة أرقام، مثل 1917.")
          : partNoYear
            ? t("Add the year too, or the date won't be saved.", "أضف السنة أيضًا، وإلا فلن يُحفظ التاريخ.")
            : t("Only know the year? Leave day and month blank.", "تعرف السنة فقط؟ اترك اليوم والشهر فارغين.")}
      </p>
      {name && <input type="hidden" name={name} value={value} />}
    </fieldset>
  );
}
