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
  migration: { ar: "الهجرة", en: "Migration" },
  education: { ar: "التعليم", en: "Education" },
  notable_story: { ar: "قصة بارزة", en: "Notable story" },
  custom: { ar: "حدث مخصص", en: "Custom" },
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
};

export function EventForm({ action, returnHref, lang }: Props) {
  const router = useRouter();
  const [type, setType] = useState<string>("notable_story");

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result?.success) {
        toast.success(lang === "ar" ? "تمت إضافة الحدث" : "Event added");
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

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.success && state.error && (
        <p className="rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="type" className="text-sm font-medium">
            {lang === "ar" ? "نوع الحدث" : "Event type"}
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 w-full rounded-md border border-[var(--input)] bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t, TYPE_LABELS)}
              </option>
            ))}
          </select>
        </div>

        {type === "custom" && (
          <div className="space-y-1.5">
            <label htmlFor="custom_label" className="text-sm font-medium">
              {lang === "ar" ? "تسمية الحدث" : "Custom label"}
            </label>
            <Input id="custom_label" name="custom_label" dir="auto" maxLength={120} />
            {fieldError("custom_label") && (
              <p className="text-xs text-[var(--destructive)]">{fieldError("custom_label")}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="date_value" className="text-sm font-medium">
            {lang === "ar" ? "التاريخ" : "Date"}
          </label>
          <Input id="date_value" name="date_value" type="date" />
          <p className="text-xs text-[var(--muted-foreground)]">
            {lang === "ar"
              ? "اتركه فارغاً إذا كان التاريخ غير معروف."
              : "Leave empty if the date is unknown."}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="date_precision" className="text-sm font-medium">
            {lang === "ar" ? "دقة التاريخ" : "Date precision"}
          </label>
          <select
            id="date_precision"
            name="date_precision"
            defaultValue="exact"
            className="h-9 w-full rounded-md border border-[var(--input)] bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {DATE_PRECISIONS.map((p) => (
              <option key={p} value={p}>
                {label(p, PRECISION_LABELS)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="location" className="text-sm font-medium">
            {lang === "ar" ? "المكان" : "Location"}
          </label>
          <Input id="location" name="location" dir="auto" maxLength={200} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="story_ar" className="text-sm font-medium">
          {lang === "ar" ? "القصة (بالعربية)" : "Story (Arabic)"}
        </label>
        <textarea
          id="story_ar"
          name="story_ar"
          dir="rtl"
          rows={4}
          maxLength={4000}
          className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="story_en" className="text-sm font-medium">
          {lang === "ar" ? "القصة (بالإنجليزية)" : "Story (English)"}
        </label>
        <textarea
          id="story_en"
          name="story_en"
          dir="ltr"
          rows={4}
          maxLength={4000}
          className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? lang === "ar"
              ? "جارٍ الحفظ…"
              : "Saving…"
            : lang === "ar"
              ? "إضافة الحدث"
              : "Add event"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(returnHref)}>
          {lang === "ar" ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
