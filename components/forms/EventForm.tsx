"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions/people";
import { EVENT_TYPES, DATE_PRECISIONS } from "@/lib/validation/events";

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  birth: { ar: "الميلاد", en: "Birth" },
  death: { ar: "الوفاة", en: "Death" },
  marriage: { ar: "الزواج", en: "Marriage" },
  divorce: { ar: "الطلاق", en: "Divorce" },
  engagement: { ar: "الخطوبة", en: "Engagement" },
  migration: { ar: "انتقال إلى مكان جديد", en: "Moved somewhere new" },
  education: { ar: "التعليم", en: "Education" },
  notable_story: { ar: "ذكرى أو قصة", en: "A memory or story" },
  custom: { ar: "شيء آخر", en: "Something else" },
};

const PRECISION_LABELS: Record<string, { ar: string; en: string }> = {
  exact: { ar: "تاريخ دقيق", en: "Exact date" },
  year: { ar: "السنة فقط", en: "Year only" },
  decade: { ar: "العقد", en: "Decade" },
  before: { ar: "قبل", en: "Before" },
  after: { ar: "بعد", en: "After" },
  around: { ar: "حوالي", en: "Around" },
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  returnHref: string;
  lang: "ar" | "en";
  /** "memory" fixes the type to a story (notable_story) and uses gentler wording. */
  kind?: "memory" | "event";
};

const fieldClass =
  "w-full rounded-2xl border border-transparent bg-[var(--input)] px-4 py-3 text-[15px] text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] hover:border-[var(--border-strong)] focus-visible:border-[var(--primary)] focus-visible:bg-[var(--card)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const selectClass =
  "h-11 w-full rounded-full border border-transparent bg-[var(--input)] px-4 text-[15px] text-[var(--foreground)] outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:border-[var(--primary)] focus-visible:bg-[var(--card)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelClass = "text-sm font-semibold text-[var(--foreground)]";
const hintClass = "text-xs text-[var(--muted-foreground)]";

export function EventForm({ action, returnHref, lang, kind = "event" }: Props) {
  const router = useRouter();
  const memory = kind === "memory";
  const [type, setType] = useState<string>(memory ? "notable_story" : "birth");
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result?.success) {
        toast.success(memory ? t("Memory saved", "تم حفظ الذكرى") : t("Added to the life story", "أضيف إلى قصة الحياة"));
        router.push(returnHref);
        router.refresh();
      }
      return result;
    },
    null,
  );

  const label = (key: string, map: Record<string, { ar: string; en: string }>) =>
    lang === "ar" ? (map[key]?.ar ?? key) : (map[key]?.en ?? key);

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  // The visitor's own language comes first; the other is optional.
  const storyFields = [
    {
      name: "story_en",
      dir: "ltr" as const,
      label: memory ? t("Your memory (English)", "الذكرى (بالإنجليزية)") : t("Story (English)", "القصة (بالإنجليزية)"),
    },
    {
      name: "story_ar",
      dir: "rtl" as const,
      label: memory ? t("Your memory (Arabic)", "الذكرى (بالعربية)") : t("Story (Arabic)", "القصة (بالعربية)"),
    },
  ];
  if (lang === "ar") storyFields.reverse();

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.success && state.error && (
        <p role="alert" className="rounded-2xl bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {state.error}
        </p>
      )}

      {memory ? (
        <input type="hidden" name="type" value="notable_story" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="type" className={labelClass}>
              {t("What happened?", "ماذا حدث؟")}
            </label>
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
              {EVENT_TYPES.map((et) => (
                <option key={et} value={et}>
                  {label(et, TYPE_LABELS)}
                </option>
              ))}
            </select>
          </div>

          {type === "custom" && (
            <div className="space-y-1.5">
              <label htmlFor="custom_label" className={labelClass}>
                {t("Give it a short title", "اكتب عنوانًا قصيرًا")}
              </label>
              <Input id="custom_label" name="custom_label" dir="auto" maxLength={120} aria-invalid={!!fieldError("custom_label")} />
              {fieldError("custom_label") && <p className="text-xs text-[var(--destructive)]">{fieldError("custom_label")}</p>}
            </div>
          )}
        </div>
      )}

      {storyFields.map((f, i) => (
        <div key={f.name} className="space-y-1.5">
          <label htmlFor={f.name} className={labelClass}>
            {f.label}
            {i > 0 && <span className="font-normal text-[var(--muted-foreground)]"> {t("(optional)", "(اختياري)")}</span>}
          </label>
          <textarea
            id={f.name}
            name={f.name}
            dir={f.dir}
            rows={memory && i === 0 ? 6 : 4}
            required={memory && i === 0}
            maxLength={4000}
            placeholder={
              memory && i === 0
                ? t("What do you remember? A moment, a habit, something they used to say…", "ماذا تتذكر؟ لحظة، عادة، شيء كانوا يقولونه…")
                : undefined
            }
            className={fieldClass}
          />
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="date_value" className={labelClass}>
            {memory ? t("When was it? (optional)", "متى كان ذلك؟ (اختياري)") : t("Date", "التاريخ")}
          </label>
          <Input id="date_value" name="date_value" type="date" />
          <p className={hintClass}>{t("Leave empty if you're not sure.", "اتركه فارغًا إن لم تكن متأكدًا.")}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="date_precision" className={labelClass}>
            {t("How sure is the date?", "ما مدى دقة التاريخ؟")}
          </label>
          <select id="date_precision" name="date_precision" defaultValue={memory ? "around" : "exact"} className={selectClass}>
            {DATE_PRECISIONS.map((p) => (
              <option key={p} value={p}>
                {label(p, PRECISION_LABELS)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="location" className={labelClass}>
            {memory ? t("Where was it? (optional)", "أين كان ذلك؟ (اختياري)") : t("Place", "المكان")}
          </label>
          <Input id="location" name="location" dir="auto" maxLength={200} placeholder={t("e.g. Beirut", "مثلًا: بيروت")} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending
            ? t("Saving…", "جارٍ الحفظ…")
            : memory
              ? t("Save memory", "احفظ الذكرى")
              : t("Add to life story", "أضف إلى قصة الحياة")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(returnHref)}>
          {t("Cancel", "إلغاء")}
        </Button>
      </div>
    </form>
  );
}
