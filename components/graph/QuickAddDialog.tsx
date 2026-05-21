"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import { createPersonQuick } from "@/lib/actions/people";

export type QuickAddRelation =
  | { kind: "child"; parentId: string; parentGender: "m" | "f" | "unknown" }
  | { kind: "parent"; childId: string; parentGender: "m" | "f" | "unknown" }
  | { kind: "spouse"; otherId: string }
  | { kind: "standalone" };

type Props = {
  relation: QuickAddRelation;
  lang: "ar" | "en";
  onClose: () => void;
};

function SubmitButton({ lang }: { lang: "ar" | "en" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
    >
      {pending ? (lang === "ar" ? "جاري الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ" : "Save")}
    </button>
  );
}

export function QuickAddDialog({ relation, lang, onClose }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(createPersonQuick, null);
  const firstInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInput.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close dialog after successful save (no redirect in createPersonQuick)
  useEffect(() => {
    if (state?.success) onClose();
  }, [state?.success, onClose]);

  const fatherId = relation.kind === "child" && relation.parentGender !== "f" ? relation.parentId : null;
  const motherId = relation.kind === "child" && relation.parentGender === "f" ? relation.parentId : null;
  const spouseId = relation.kind === "spouse" ? relation.otherId : null;
  const childId = relation.kind === "parent" ? relation.childId : null;

  const title =
    relation.kind === "child" ? (lang === "ar" ? "إضافة ابن/ابنة" : "Add child")
    : relation.kind === "parent" ? (lang === "ar" ? "إضافة والد/والدة" : "Add parent")
    : relation.kind === "spouse" ? (lang === "ar" ? "إضافة زوج/زوجة" : "Add spouse")
    : (lang === "ar" ? "إضافة شخص" : "Add person");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        <form action={formAction} className="space-y-3">
          {state && !state.success && state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">{lang === "ar" ? "الاسم (إنجليزي)" : "Given name (EN)"}</label>
            <input
              ref={firstInput}
              name="given_en"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {state && !state.success && state.fieldErrors?.given_en && (
              <p className="text-xs text-red-500 mt-1">{state.fieldErrors.given_en}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{lang === "ar" ? "الاسم (عربي)" : "Given name (AR)"}</label>
            <input
              name="given_ar"
              dir="rtl"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-2">{lang === "ar" ? "الجنس" : "Gender"}</label>
            <div className="flex gap-3">
              {(["m", "f"] as const).map((g) => (
                <label key={g} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="gender" value={g} defaultChecked={g === "m"} className="accent-amber-500" />
                  {g === "f" ? (lang === "ar" ? "أنثى" : "Female") : (lang === "ar" ? "ذكر" : "Male")}
                </label>
              ))}
            </div>
          </div>

          <input type="hidden" name="father_id" value={fatherId ?? ""} />
          <input type="hidden" name="mother_id" value={motherId ?? ""} />
          <input type="hidden" name="spouse_id" value={spouseId ?? ""} />
          <input type="hidden" name="child_id" value={childId ?? ""} />
          <input type="hidden" name="is_placeholder" value="false" />
          <input type="hidden" name="photo_url" value="" />
          <input type="hidden" name="father_name_en" value="" />
          <input type="hidden" name="father_name_ar" value="" />
          <input type="hidden" name="grandfather_name_en" value="" />
          <input type="hidden" name="grandfather_name_ar" value="" />
          <input type="hidden" name="great_grandfather_name_en" value="" />
          <input type="hidden" name="great_grandfather_name_ar" value="" />
          <input type="hidden" name="family_name_en" value="" />
          <input type="hidden" name="family_name_ar" value="" />
          <input type="hidden" name="notes_en" value="" />
          <input type="hidden" name="notes_ar" value="" />

          <div className="flex gap-2 justify-end pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
            <SubmitButton lang={lang} />
          </div>
        </form>
      </div>
    </div>
  );
}
