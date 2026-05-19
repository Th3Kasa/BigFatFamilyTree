"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Languages, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/actions/people";
import { translateToArabic } from "@/lib/actions/translate";
import { PhotoUpload } from "./PhotoUpload";

type PersonRow = {
  id?: string;
  given_en?: string | null;
  given_ar?: string | null;
  father_name_en?: string | null;
  father_name_ar?: string | null;
  grandfather_name_en?: string | null;
  grandfather_name_ar?: string | null;
  great_grandfather_name_en?: string | null;
  great_grandfather_name_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
  gender?: "m" | "f" | "unknown";
  father_id?: string | null;
  mother_id?: string | null;
  is_placeholder?: boolean;
  photo_url?: string | null;
  notes_en?: string | null;
  notes_ar?: string | null;
};

type PeopleLookup = Pick<PersonRow, "id" | "given_en" | "given_ar" | "family_name_en" | "family_name_ar">[];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initialData?: PersonRow;
  people: PeopleLookup;
  lang: "ar" | "en";
  submitLabel: string;
};

const GENDER_LABELS: Record<"f" | "m" | "unknown", { en: string; ar: string }> = {
  f:       { en: "Female",  ar: "أنثى" },
  m:       { en: "Male",    ar: "ذكر" },
  unknown: { en: "Unknown", ar: "غير محدد" },
};

const INPUT_CLS = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold transition-colors"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function PersonForm({ action, initialData, people, lang, submitLabel }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialData?.photo_url ?? null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [isTranslating, startTranslateTransition] = useTransition();

  // Controlled Arabic fields so translate can update them
  const [givenAr, setGivenAr] = useState(initialData?.given_ar ?? "");
  const [familyAr, setFamilyAr] = useState(initialData?.family_name_ar ?? "");
  const [fatherAr, setFatherAr] = useState(initialData?.father_name_ar ?? "");
  const [grandfatherAr, setGrandfatherAr] = useState(initialData?.grandfather_name_ar ?? "");
  const [notesAr, setNotesAr] = useState(initialData?.notes_ar ?? "");

  // Refs to read EN values at translate time
  const givenEnRef = useRef<HTMLInputElement>(null);
  const familyEnRef = useRef<HTMLInputElement>(null);
  const fatherEnRef = useRef<HTMLInputElement>(null);
  const grandfatherEnRef = useRef<HTMLInputElement>(null);
  const notesEnRef = useRef<HTMLTextAreaElement>(null);

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  const personLabel = (p: PeopleLookup[number]) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  function handleTranslate() {
    setTranslateError(null);
    startTranslateTransition(async () => {
      const result = await translateToArabic({
        given_en: givenEnRef.current?.value ?? undefined,
        family_name_en: familyEnRef.current?.value ?? undefined,
        father_name_en: fatherEnRef.current?.value ?? undefined,
        grandfather_name_en: grandfatherEnRef.current?.value ?? undefined,
        notes_en: notesEnRef.current?.value ?? undefined,
      });
      if (!result.success) {
        setTranslateError(result.error);
        return;
      }
      if (result.data.given_ar) setGivenAr(result.data.given_ar);
      if (result.data.family_name_ar) setFamilyAr(result.data.family_name_ar);
      if (result.data.father_name_ar) setFatherAr(result.data.father_name_ar);
      if (result.data.grandfather_name_ar) setGrandfatherAr(result.data.grandfather_name_ar);
      if (result.data.notes_ar) setNotesAr(result.data.notes_ar);
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <PhotoUpload currentUrl={photoUrl} onUpload={setPhotoUrl} />
        <input type="hidden" name="photo_url" value={photoUrl ?? ""} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">
          {lang === "ar" ? "الاسم الأول" : "Given name"}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="given_en" className="block text-xs text-gray-500 mb-1">English</label>
            <input
              ref={givenEnRef}
              id="given_en"
              name="given_en"
              defaultValue={initialData?.given_en ?? ""}
              placeholder="e.g. Marcelle"
              className={INPUT_CLS}
            />
            {fieldError("given_en") && (
              <p className="text-xs text-red-500 mt-1">{fieldError("given_en")}</p>
            )}
          </div>
          <div>
            <label htmlFor="given_ar" className="block text-xs text-gray-500 mb-1">عربي</label>
            <input
              id="given_ar"
              name="given_ar"
              value={givenAr}
              onChange={(e) => setGivenAr(e.target.value)}
              placeholder="مثال: مارسيل"
              dir="rtl"
              className={INPUT_CLS}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="family_name_en" className="block text-xs text-gray-500 mb-1">Family name (EN)</label>
          <input ref={familyEnRef} id="family_name_en" name="family_name_en" defaultValue={initialData?.family_name_en ?? ""} className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="family_name_ar" className="block text-xs text-gray-500 mb-1">اسم العائلة</label>
          <input id="family_name_ar" name="family_name_ar" value={familyAr} onChange={(e) => setFamilyAr(e.target.value)} dir="rtl" className={INPUT_CLS} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="father_name_en" className="block text-xs text-gray-500 mb-1">Father name (EN)</label>
          <input ref={fatherEnRef} id="father_name_en" name="father_name_en" defaultValue={initialData?.father_name_en ?? ""} className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="father_name_ar" className="block text-xs text-gray-500 mb-1">اسم الأب</label>
          <input id="father_name_ar" name="father_name_ar" value={fatherAr} onChange={(e) => setFatherAr(e.target.value)} dir="rtl" className={INPUT_CLS} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="grandfather_name_en" className="block text-xs text-gray-500 mb-1">Grandfather name (EN)</label>
          <input ref={grandfatherEnRef} id="grandfather_name_en" name="grandfather_name_en" defaultValue={initialData?.grandfather_name_en ?? ""} className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="grandfather_name_ar" className="block text-xs text-gray-500 mb-1">اسم الجد</label>
          <input id="grandfather_name_ar" name="grandfather_name_ar" value={grandfatherAr} onChange={(e) => setGrandfatherAr(e.target.value)} dir="rtl" className={INPUT_CLS} />
        </div>
      </div>

      {/* Auto-translate button */}
      <div>
        <button
          type="button"
          onClick={handleTranslate}
          disabled={isTranslating}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
        >
          {isTranslating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Languages className="w-3.5 h-3.5" />}
          {lang === "ar" ? "ترجمة إلى العربية تلقائياً" : "Auto-translate EN → AR"}
        </button>
        {translateError && (
          <p className="text-xs text-red-500 mt-1">{translateError}</p>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">{lang === "ar" ? "الجنس" : "Gender"}</p>
        <div className="flex gap-4">
          {(["f", "m", "unknown"] as const).map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="gender"
                value={g}
                defaultChecked={(initialData?.gender ?? "unknown") === g}
                className="accent-amber-500"
              />
              {GENDER_LABELS[g][lang]}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="father_id" className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الأب" : "Father"}
          </label>
          <select
            id="father_id"
            name="father_id"
            defaultValue={initialData?.father_id ?? ""}
            className={`${INPUT_CLS} bg-white`}
          >
            <option value="">— none —</option>
            {people
              .filter((p) => p.id !== initialData?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{personLabel(p)}</option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="mother_id" className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الأم" : "Mother"}
          </label>
          <select
            id="mother_id"
            name="mother_id"
            defaultValue={initialData?.mother_id ?? ""}
            className={`${INPUT_CLS} bg-white`}
          >
            <option value="">— none —</option>
            {people
              .filter((p) => p.id !== initialData?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{personLabel(p)}</option>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes_en" className="block text-xs text-gray-500 mb-1">
          {lang === "ar" ? "ملاحظات (إنجليزي)" : "Notes (English)"}
        </label>
        <textarea
          ref={notesEnRef}
          id="notes_en"
          name="notes_en"
          defaultValue={initialData?.notes_en ?? ""}
          rows={3}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
      <div>
        <label htmlFor="notes_ar" className="block text-xs text-gray-500 mb-1">ملاحظات (عربي)</label>
        <textarea
          id="notes_ar"
          name="notes_ar"
          value={notesAr}
          onChange={(e) => setNotesAr(e.target.value)}
          rows={3}
          dir="rtl"
          className={`${INPUT_CLS} resize-none`}
        />
      </div>

      <input type="hidden" name="is_placeholder" value="false" />
      <input type="hidden" name="great_grandfather_name_en" value={initialData?.great_grandfather_name_en ?? ""} />
      <input type="hidden" name="great_grandfather_name_ar" value={initialData?.great_grandfather_name_ar ?? ""} />

      <SubmitButton label={submitLabel} />
    </form>
  );
}
