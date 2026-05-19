"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Languages, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PhotoUpload } from "@/components/forms/PhotoUpload";
import { translateToArabic } from "@/lib/actions/translate";
import type { ActionState } from "@/lib/actions/people";

const SESSION_KEY = "person_stepper_en";

type PeopleLookup = {
  id?: string;
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
}[];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  people: PeopleLookup;
  lang: "ar" | "en";
  fatherId?: string | null;
  motherIdProp?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
};

const INPUT_CLS =
  "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition";

const STEP_TITLES = {
  en: ["Names", "Photo & Dates", "Confirm"],
  ar: ["الأسماء", "صورة وتواريخ", "تأكيد"],
};

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
          {label === "Save" ? "Saving…" : "جاري الحفظ…"}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Check className="h-4 w-4" />
          {label}
        </span>
      )}
    </Button>
  );
}

export function PersonStepper({
  action,
  people,
  lang,
  fatherId,
  motherIdProp,
  fatherName,
  motherName,
}: Props) {
  const [state, formAction] = useActionState(action, null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isTranslating, startTranslate] = useTransition();
  const [translateError, setTranslateError] = useState<string | null>(null);
  // Stored EN values that came from sessionStorage (shown as hint in AR mode)
  const [storedEn, setStoredEn] = useState<{ given_en: string; family_name_en: string } | null>(null);

  const [fields, setFields] = useState({
    given_en: "",
    given_ar: "",
    family_name_en: "",
    family_name_ar: "",
    birth_date: "",
    death_date: "",
    gender: "unknown" as "m" | "f" | "unknown",
    notes_en: "",
    notes_ar: "",
  });

  // On mount in AR mode: check sessionStorage for EN values and auto-translate
  useEffect(() => {
    if (lang !== "ar") return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { given_en?: string; family_name_en?: string };
      if (!saved.given_en && !saved.family_name_en) return;
      setStoredEn({ given_en: saved.given_en ?? "", family_name_en: saved.family_name_en ?? "" });
      // Auto-translate immediately
      setTranslateError(null);
      startTranslate(async () => {
        const result = await translateToArabic({
          given_en: saved.given_en ?? undefined,
          family_name_en: saved.family_name_en ?? undefined,
        });
        if (result.success) {
          setFields((f) => ({
            ...f,
            given_ar: result.data.given_ar ?? f.given_ar,
            family_name_ar: result.data.family_name_ar ?? f.family_name_ar,
          }));
        } else {
          setTranslateError(result.error);
        }
        sessionStorage.removeItem(SESSION_KEY);
      });
    } catch {
      // sessionStorage not available
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save EN values to sessionStorage whenever they change (so lang switch preserves them)
  useEffect(() => {
    if (lang !== "en") return;
    try {
      if (fields.given_en || fields.family_name_en) {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ given_en: fields.given_en, family_name_en: fields.family_name_en })
        );
      }
    } catch {
      // sessionStorage not available
    }
  }, [lang, fields.given_en, fields.family_name_en]);

  const t = {
    next: lang === "ar" ? "التالي" : "Next",
    back: lang === "ar" ? "رجوع" : "Back",
    skip: lang === "ar" ? "تخطى" : "Skip",
    save: lang === "ar" ? "حفظ" : "Save",
    addingChildOf: lang === "ar" ? "إضافة طفل لـ" : "Adding child of",
    givenName: lang === "ar" ? "الاسم الأول" : "Given name",
    familyName: lang === "ar" ? "اسم العائلة" : "Family name",
    photo: lang === "ar" ? "الصورة" : "Photo",
    birthDate: lang === "ar" ? "تاريخ الميلاد" : "Birth date",
    deathDate: lang === "ar" ? "تاريخ الوفاة" : "Death date",
    gender: lang === "ar" ? "الجنس" : "Gender",
    male: lang === "ar" ? "ذكر" : "Male",
    female: lang === "ar" ? "أنثى" : "Female",
    unknown: lang === "ar" ? "غير محدد" : "Unknown",
    notesLabel: lang === "ar" ? "ملاحظات" : "Notes",
    confirmTitle: lang === "ar" ? "مراجعة قبل الحفظ" : "Review before saving",
    name: lang === "ar" ? "الاسم" : "Name",
    dates: lang === "ar" ? "التواريخ" : "Dates",
    notSet: lang === "ar" ? "غير محدد" : "Not set",
    translatingHint: lang === "ar" ? "جاري الترجمة…" : "Translating…",
    translateBtn: lang === "ar" ? "ترجمة من الإنجليزية" : "Translate from English",
  };

  const parentBadge = (fatherName ?? motherName)
    ? `${t.addingChildOf} ${fatherName ?? motherName}`
    : null;

  function goNext() { setDir(1); setStep((s) => Math.min(s + 1, 2)); }
  function goBack() { setDir(-1); setStep((s) => Math.max(s - 1, 0)); }
  function skipStep() { setDir(1); setStep((s) => Math.min(s + 1, 2)); }

  const fullGiven =
    lang === "ar"
      ? fields.given_ar || fields.given_en || "—"
      : fields.given_en || fields.given_ar || "—";
  const fullFamily =
    lang === "ar"
      ? fields.family_name_ar || fields.family_name_en || "—"
      : fields.family_name_en || fields.family_name_ar || "—";

  return (
    <div className="w-full max-w-lg mx-auto">
      {parentBadge && (
        <Badge variant="secondary" className="mb-4 text-xs">
          {parentBadge}
        </Badge>
      )}

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {STEP_TITLES[lang].map((title, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { if (i < step) { setDir(-1); setStep(i); } }}
            className="flex items-center gap-2 group"
            aria-label={title}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all duration-200",
                i === step
                  ? "bg-[var(--primary)] scale-125"
                  : i < step
                    ? "bg-[var(--primary)]/50"
                    : "bg-[var(--muted-foreground)]/30"
              )}
            />
            <span
              className={cn(
                "text-xs transition-colors hidden sm:inline",
                i === step ? "text-[var(--primary)] font-medium" : "text-[var(--muted-foreground)]"
              )}
            >
              {title}
            </span>
            {i < STEP_TITLES[lang].length - 1 && (
              <span className="w-6 h-px bg-[var(--border)]" />
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <form action={formAction}>
            {/* Hidden fields */}
            <input type="hidden" name="is_placeholder" value="false" />
            <input type="hidden" name="photo_url" value={photoUrl ?? ""} />
            {fatherId && <input type="hidden" name="father_id" value={fatherId} />}
            {motherIdProp && <input type="hidden" name="mother_id" value={motherIdProp} />}
            <input type="hidden" name="given_en" value={fields.given_en} />
            <input type="hidden" name="given_ar" value={fields.given_ar} />
            <input type="hidden" name="family_name_en" value={fields.family_name_en} />
            <input type="hidden" name="family_name_ar" value={fields.family_name_ar} />
            <input type="hidden" name="gender" value={fields.gender} />
            <input type="hidden" name="notes_en" value={fields.notes_en} />
            <input type="hidden" name="notes_ar" value={fields.notes_ar} />
            <input type="hidden" name="great_grandfather_name_en" value="" />
            <input type="hidden" name="great_grandfather_name_ar" value="" />

            {state?.error && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
                {state.error}
              </div>
            )}

            <div className="overflow-hidden">
              <AnimatePresence mode="wait" custom={dir}>
                {step === 0 && (
                  <motion.div
                    key="step0"
                    custom={dir}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="space-y-5"
                  >
                    {/* Auto-translate status banner (AR mode only) */}
                    {lang === "ar" && (isTranslating || storedEn) && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {isTranslating
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />{t.translatingHint}</>
                          : <><Languages className="w-3.5 h-3.5 shrink-0" />{`${storedEn?.given_en ?? ""} ${storedEn?.family_name_en ?? ""}`.trim()}</>
                        }
                      </div>
                    )}
                    {translateError && (
                      <p className="text-xs text-[var(--destructive)]">{translateError}</p>
                    )}

                    {/* Given name — single language */}
                    <div>
                      <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                        {t.givenName}
                      </label>
                      {lang === "en" ? (
                        <input
                          className={INPUT_CLS}
                          placeholder="e.g. Samuel"
                          value={fields.given_en}
                          onChange={(e) => setFields((f) => ({ ...f, given_en: e.target.value }))}
                        />
                      ) : (
                        <input
                          className={INPUT_CLS}
                          placeholder="مثال: صموئيل"
                          dir="rtl"
                          value={fields.given_ar}
                          onChange={(e) => setFields((f) => ({ ...f, given_ar: e.target.value }))}
                        />
                      )}
                    </div>

                    {/* Family name — single language */}
                    <div>
                      <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                        {t.familyName}
                      </label>
                      {lang === "en" ? (
                        <input
                          className={INPUT_CLS}
                          placeholder="e.g. Abdullah"
                          value={fields.family_name_en}
                          onChange={(e) => setFields((f) => ({ ...f, family_name_en: e.target.value }))}
                        />
                      ) : (
                        <input
                          className={INPUT_CLS}
                          placeholder="مثال: عبدالله"
                          dir="rtl"
                          value={fields.family_name_ar}
                          onChange={(e) => setFields((f) => ({ ...f, family_name_ar: e.target.value }))}
                        />
                      )}
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        type="button"
                        onClick={goNext}
                        disabled={lang === "en" ? !fields.given_en : !fields.given_ar}
                      >
                        {t.next}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step1"
                    custom={dir}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="space-y-5"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-[var(--muted-foreground)]">{t.photo}</p>
                      <PhotoUpload currentUrl={photoUrl} onUpload={setPhotoUrl} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                          {t.birthDate}
                        </label>
                        <input
                          type="text"
                          className={INPUT_CLS}
                          placeholder="YYYY or YYYY-MM-DD"
                          value={fields.birth_date}
                          onChange={(e) => setFields((f) => ({ ...f, birth_date: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                          {t.deathDate}
                        </label>
                        <input
                          type="text"
                          className={INPUT_CLS}
                          placeholder="YYYY or YYYY-MM-DD"
                          value={fields.death_date}
                          onChange={(e) => setFields((f) => ({ ...f, death_date: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-between">
                      <Button type="button" variant="ghost" onClick={goBack}>
                        <ArrowLeft className="h-4 w-4" />
                        {t.back}
                      </Button>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={skipStep}>
                          <SkipForward className="h-4 w-4" />
                          {t.skip}
                        </Button>
                        <Button type="button" onClick={goNext}>
                          {t.next}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    custom={dir}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="space-y-5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)] mb-3">
                        {t.gender}
                      </p>
                      <div className="flex gap-3">
                        {(["m", "f", "unknown"] as const).map((g) => (
                          <label
                            key={g}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm cursor-pointer transition-colors",
                              fields.gender === g
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] font-medium"
                                : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/40"
                            )}
                          >
                            <input
                              type="radio"
                              className="sr-only"
                              checked={fields.gender === g}
                              onChange={() => setFields((f) => ({ ...f, gender: g }))}
                            />
                            {g === "m" ? t.male : g === "f" ? t.female : t.unknown}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                        {t.notesLabel}
                      </label>
                      <textarea
                        className={cn(INPUT_CLS, "resize-none")}
                        rows={3}
                        dir={lang === "ar" ? "rtl" : "ltr"}
                        value={lang === "ar" ? fields.notes_ar : fields.notes_en}
                        onChange={(e) =>
                          setFields((f) =>
                            lang === "ar"
                              ? { ...f, notes_ar: e.target.value }
                              : { ...f, notes_en: e.target.value }
                          )
                        }
                      />
                    </div>

                    {/* Summary */}
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 space-y-2 text-sm">
                      <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
                        {t.confirmTitle}
                      </p>
                      <div className="flex justify-between">
                        <span className="text-[var(--muted-foreground)]">{t.name}</span>
                        <span className="font-medium">{fullGiven} {fullFamily}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--muted-foreground)]">{t.gender}</span>
                        <span className="font-medium capitalize">{fields.gender}</span>
                      </div>
                      {(fields.birth_date || fields.death_date) && (
                        <div className="flex justify-between">
                          <span className="text-[var(--muted-foreground)]">{t.dates}</span>
                          <span className="font-medium">
                            {fields.birth_date || t.notSet}
                            {fields.death_date ? ` – ${fields.death_date}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex justify-between">
                      <Button type="button" variant="ghost" onClick={goBack}>
                        <ArrowLeft className="h-4 w-4" />
                        {t.back}
                      </Button>
                      <SubmitButton label={t.save} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
