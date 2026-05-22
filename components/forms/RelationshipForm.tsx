"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";

type PersonOption = {
  id?: string;
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
};

type Props = {
  people: PersonOption[];
  lang: "ar" | "en";
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
    >
      {pending ? "…" : "Add"}
    </button>
  );
}

export function RelationshipForm({ people, lang, action }: Props) {
  const [state, formAction] = useActionState(action, null);

  const personLabel = (p: PersonOption) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-xs text-green-600">
          {lang === "ar" ? "تمت الإضافة" : "Added successfully"}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="rel_other_person" className="block text-xs text-gray-500 mb-1">Person</label>
          <select
            id="rel_other_person"
            name="other_person_id"
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="">— select —</option>
            {people.filter((p) => p.id).map((p) => (
              <option key={p.id} value={p.id}>{personLabel(p)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rel_type" className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              id="rel_type"
              name="type"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              <option value="spouse">Spouse</option>
              <option value="adopted_by">Adopted by</option>
              <option value="raised_by">Raised by</option>
              <option value="godparent">Godparent</option>
            </select>
          </div>
          <div>
            <label htmlFor="rel_status" className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              id="rel_status"
              name="status"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              <option value="current">Current</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
            </select>
          </div>
        </div>
        <SubmitButton />
      </div>
    </form>
  );
}
