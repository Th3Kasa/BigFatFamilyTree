"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
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

  function fieldError(name: string): string | undefined {
    return state?.fieldErrors?.[name];
  }

  const personLabel = (p: PeopleLookup[number]) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex justify-center">
        <PhotoUpload currentUrl={photoUrl} onUpload={setPhotoUrl} />
        <input type="hidden" name="photo_url" value={photoUrl ?? ""} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">
          {lang === "ar" ? "الاسم الأول" : "Given name"}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">English</label>
            <input
              name="given_en"
              defaultValue={initialData?.given_en ?? ""}
              placeholder="e.g. Marcelle"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {fieldError("given_en") && (
              <p className="text-xs text-red-500 mt-1">{fieldError("given_en")}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">عربي</label>
            <input
              name="given_ar"
              defaultValue={initialData?.given_ar ?? ""}
              placeholder="مثال: مارسيل"
              dir="rtl"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Father name (EN)</label>
          <input name="father_name_en" defaultValue={initialData?.father_name_en ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">اسم الأب</label>
          <input name="father_name_ar" defaultValue={initialData?.father_name_ar ?? ""} dir="rtl" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Grandfather name (EN)</label>
          <input name="grandfather_name_en" defaultValue={initialData?.grandfather_name_en ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">اسم الجد</label>
          <input name="grandfather_name_ar" defaultValue={initialData?.grandfather_name_ar ?? ""} dir="rtl" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Family name (EN)</label>
          <input name="family_name_en" defaultValue={initialData?.family_name_en ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">اسم العائلة</label>
          <input name="family_name_ar" defaultValue={initialData?.family_name_ar ?? ""} dir="rtl" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-2">
          {lang === "ar" ? "الجنس" : "Gender"}
        </label>
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
              {g === "f" ? "Female" : g === "m" ? "Male" : "Unknown"}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الأب" : "Father"}
          </label>
          <select
            name="father_id"
            defaultValue={initialData?.father_id ?? ""}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
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
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الأم" : "Mother"}
          </label>
          <select
            name="mother_id"
            defaultValue={initialData?.mother_id ?? ""}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
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
        <label className="block text-xs text-gray-500 mb-1">
          {lang === "ar" ? "ملاحظات (إنجليزي)" : "Notes (English)"}
        </label>
        <textarea
          name="notes_en"
          defaultValue={initialData?.notes_en ?? ""}
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">ملاحظات (عربي)</label>
        <textarea
          name="notes_ar"
          defaultValue={initialData?.notes_ar ?? ""}
          rows={3}
          dir="rtl"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
      </div>

      <input type="hidden" name="is_placeholder" value="false" />
      <input type="hidden" name="great_grandfather_name_en" value={initialData?.great_grandfather_name_en ?? ""} />
      <input type="hidden" name="great_grandfather_name_ar" value={initialData?.great_grandfather_name_ar ?? ""} />

      <SubmitButton label={submitLabel} />
    </form>
  );
}
