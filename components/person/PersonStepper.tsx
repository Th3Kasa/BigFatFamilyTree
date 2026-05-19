"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PhotoUpload } from "@/components/forms/PhotoUpload";
import type { ActionState } from "@/lib/actions/people";

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

  // Collected field values across steps
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

  const t = {
    next: lang === "ar" ? "التالي" : "Next",
    back: lang === "ar" ? "رجوع" : "Back",
    skip: lang === "ar" ? "تخطى" : "Skip",
    save: lang === "ar" ? "حفظ" : "Save",
    addingChildOf: lang === "ar" ? "إضافة طفل لـ" : "Adding child of",
    givenName: lang === "ar" ? "الاسم الأول" : "Given name",
    familyName: lang === "ar" ? "اسم العائلة" : "Family name",
    givenEn: "Given name (EN)",
    givenAr: "الاسم الأول بالعربي",
    familyEn: "Family name (EN)",
    familyAr: "اسم العائلة بالعربي",
    photo: lang === "ar" ? "الصورة" : "Photo",
    birthDate: lang === "ar" ? "تاريخ الميلاد" : "Birth date",
    deathDate: lang === "ar" ? "تاريخ الوفاة" : "Death date",
    gender: lang === "ar" ? "الجنس" : "Gender",
    male: lang === "ar" ? "ذكر" : "Male",
    female: lang === "ar" ? "أنثى" : "Female",
    unknown: lang === "ar" ? "غير محدد" : "Unknown",
    notesEn: "Notes (English)",
    notesAr: "ملاحظات (عربي)",
    confirmTitle: lang === "ar" ? "مراجعة قبل الحفظ" : "Review before saving",
    name: lang === "ar" ? "الاسم" : "Name",
    dates: lang === "ar" ? "التواريخ" : "Dates",
    notSet: lang === "ar" ? "غير محدد" : "Not set",
  };

  const parentBadge = (fatherName ?? motherName)
    ? `${t.addingChildOf} ${fatherName ?? motherName}`
    : null;

  function goNext() {
    setDir(1);
    setStep((s) => Math.min(s + 1, 2));
  }
  function goBack() {
    setDir(-1);
    setStep((s) => Math.max(s - 1, 0));
  }
  function skipStep() {
    setDir(1);
    setStep((s) => Math.min(s + 1, 2));
  }

  const fullGiven = fields.given_en || fields.given_ar || "—";
  const fullFamily = fields.family_name_en || fields.family_name_ar || "—";

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Parent badge */}
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
            onClick={() => {
              if (i < step) {
                setDir(-1);
                setStep(i);
              }
            }}
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
                i === step
                  ? "text-[var(--primary)] font-medium"
                  : "text-[var(--muted-foreground)]"
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
            {/* Hidden fields always submitted */}
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

            {/* Animated step content */}
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
                    className="space-y-4"
                  >
                    <p className="text-sm font-semibold text-[var(--foreground)] mb-4">
                      {t.givenName}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                          {t.givenEn}
                        </label>
                        <input
                          className={INPUT_CLS}
                          placeholder="e.g. Maamoun"
                          value={fields.given_en}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, given_en: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                          {t.givenAr}
                        </label>
                        <input
                          className={INPUT_CLS}
                          placeholder="مثال: مأمون"
                          dir="rtl"
                          value={fields.given_ar}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, given_ar: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-[var(--foreground)] mt-4 mb-2">
                      {t.familyName}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                          {t.familyEn}
                        </label>
                        <input
                          className={INPUT_CLS}
                          placeholder="e.g. Morkos"
                          value={fields.family_name_en}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, family_name_en: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                          {t.familyAr}
                        </label>
                        <input
                          className={INPUT_CLS}
                          placeholder="مثال: مرقص"
                          dir="rtl"
                          value={fields.family_name_ar}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, family_name_ar: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <Button
                        type="button"
                        onClick={goNext}
                        disabled={!fields.given_en && !fields.given_ar}
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
                          onChange={(e) =>
                            setFields((f) => ({ ...f, birth_date: e.target.value }))
                          }
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
                          onChange={(e) =>
                            setFields((f) => ({ ...f, death_date: e.target.value }))
                          }
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
                    {/* Gender */}
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

                    {/* Notes */}
                    <div>
                      <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                        {t.notesEn}
                      </label>
                      <textarea
                        className={cn(INPUT_CLS, "resize-none")}
                        rows={2}
                        value={fields.notes_en}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, notes_en: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                        {t.notesAr}
                      </label>
                      <textarea
                        className={cn(INPUT_CLS, "resize-none")}
                        rows={2}
                        dir="rtl"
                        value={fields.notes_ar}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, notes_ar: e.target.value }))
                        }
                      />
                    </div>

                    {/* Summary card */}
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 space-y-2 text-sm">
                      <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
                        {t.confirmTitle}
                      </p>
                      <div className="flex justify-between">
                        <span className="text-[var(--muted-foreground)]">{t.name}</span>
                        <span className="font-medium">
                          {fullGiven} {fullFamily}
                        </span>
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
