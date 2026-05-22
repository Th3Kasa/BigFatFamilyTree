"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import type { Database } from "@/lib/db/types";
import { AudioUpload } from "./AudioUpload";

type PersonRow = Database["public"]["Tables"]["people"]["Row"];
type PeopleLookup = Pick<PersonRow, "id" | "given_en" | "given_ar">[];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  people: PeopleLookup;
  lang: "ar" | "en";
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold transition-colors"
    >
      {pending ? "Saving…" : "Save transcript"}
    </button>
  );
}

export function TranscriptForm({ action, people, lang }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [audioPath, setAudioPath] = useState<string | null>(null);

  const personLabel = (p: PeopleLookup[number]) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Audio file</label>
        <AudioUpload onUpload={(path) => setAudioPath(path)} />
        <input type="hidden" name="audio_url" value={audioPath ?? ""} />
        {state?.fieldErrors?.["audio_url"] && (
          <p className="text-xs text-red-500 mt-1">{state.fieldErrors["audio_url"]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Date recorded</label>
        <input
          type="date"
          name="recorded_at"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Recorded with</label>
        <select
          name="recorded_with"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white w-full"
        >
          <option value="">— optional —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {personLabel(p)}
            </option>
          ))}
        </select>
      </div>

      <input type="hidden" name="raw_text_ar" value="" />

      <SubmitButton />
    </form>
  );
}
