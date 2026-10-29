"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/members/primitives";
import { normaliseDigits } from "@/lib/auth/pin-validation";

type Props = {
  lang: "ar" | "en";
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  /** 4 for a personal PIN, 6 for the family PIN. */
  length: 4 | 6;
  /** "current-password" lets password managers save and fill the personal PIN. */
  autoComplete: "current-password" | "new-password" | "off";
  name: string;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * A big numeric-keypad field for a PIN. Digits only (Arabic-Indic digits are
 * converted), show/hide toggle, always left-to-right so digits never reorder in Arabic.
 */
export function PinField({ lang, label, hint, value, onChange, length, autoComplete, name, disabled, invalid }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [shown, setShown] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${uid}-pin`} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={`${uid}-pin`}
          name={name}
          type={shown ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={autoComplete}
          maxLength={length}
          dir="ltr"
          required
          value={value}
          onChange={(e) => onChange(normaliseDigits(e.target.value).replace(/\D/g, "").slice(0, length))}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${uid}-hint` : undefined}
          placeholder={"•".repeat(length)}
          className={cn(fieldClass, "pe-14 text-center text-2xl font-semibold tracking-[0.5em]")}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? t("Hide PIN", "إخفاء الرمز") : t("Show PIN", "إظهار الرمز")}
          aria-pressed={shown}
          className="absolute end-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-white hover:text-[#241517] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          {shown ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </div>
      {hint ? (
        <p id={`${uid}-hint`} className="text-xs text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
