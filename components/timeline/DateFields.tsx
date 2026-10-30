"use client";

import { useId } from "react";
import type { DatePrecision } from "@/lib/actions/timeline";

/** "When was this?": a year plus how sure we are (around, the 1970s…). */
export function DateFields({
  year,
  precision,
  onYear,
  onPrecision,
  lang,
}: {
  year: string;
  precision: DatePrecision;
  onYear: (v: string) => void;
  onPrecision: (v: DatePrecision) => void;
  lang: "ar" | "en";
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const yearId = useId();
  const precId = useId();
  const field =
    "h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[15px] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor={precId} className="mb-1 block text-[13px] font-semibold text-[var(--foreground)]">
          {t("When was this?", "متى كان ذلك؟")}
        </label>
        <select id={precId} value={precision} onChange={(e) => onPrecision(e.target.value as DatePrecision)} className={field}>
          <option value="year">{t("In", "في")}</option>
          <option value="around">{t("Around", "حوالي")}</option>
          <option value="decade">{t("In the decade", "في عقد")}</option>
          <option value="before">{t("Before", "قبل")}</option>
          <option value="after">{t("After", "بعد")}</option>
        </select>
      </div>
      <div>
        <label htmlFor={yearId} className="mb-1 block text-[13px] font-semibold text-[var(--foreground)]">
          {t("Year", "السنة")}
        </label>
        <input
          id={yearId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          value={year}
          onChange={(e) => onYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="1975"
          className={field}
        />
      </div>
    </div>
  );
}

/** A year typed in the form, or null when blank or not a plausible year. */
export function parseYear(v: string): number | null {
  const n = Number(v);
  return /^\d{4}$/.test(v) && n >= 1700 && n <= new Date().getFullYear() + 1 ? n : null;
}
