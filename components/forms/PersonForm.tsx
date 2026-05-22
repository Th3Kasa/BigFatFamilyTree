"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import type { ActionState } from "@/lib/actions/people";
import { PhotoUpload } from "./PhotoUpload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PersonPicker, type PickablePerson } from "@/components/graph/PersonPicker";

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
  birth_date?: string | null;
  death_date?: string | null;
};

type PeopleLookup = Pick<PersonRow, "id" | "given_en" | "given_ar" | "family_name_en" | "family_name_ar">[];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initialData?: PersonRow;
  people: PeopleLookup;
  lang: "ar" | "en";
  submitLabel: string;
};

const GENDER_LABELS: Record<"f" | "m", { en: string; ar: string }> = {
  f: { en: "Female", ar: "أنثى" },
  m: { en: "Male",   ar: "ذكر" },
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
  const [fatherId, setFatherId] = useState<string | null>(initialData?.father_id ?? null);
  const [motherId, setMotherId] = useState<string | null>(initialData?.mother_id ?? null);
  const [parentPicker, setParentPicker] = useState<"father" | "mother" | null>(null);
  const peopleById = new Map(people.map((p) => [p.id, p as PickablePerson]));

  const fieldError = (name: string) => state?.fieldErrors?.[name];

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
        <legend className="text-sm font-semibold text-gray-700 mb-2">Given name</legend>
        <div>
          <label htmlFor="given_en" className="block text-xs text-gray-500 mb-1">English</label>
          <input
            id="given_en"
            name="given_en"
            defaultValue={initialData?.given_en ?? ""}
            placeholder="e.g. Esmak"
            className={INPUT_CLS}
          />
          {fieldError("given_en") && (
            <p className="text-xs text-red-500 mt-1">{fieldError("given_en")}</p>
          )}
        </div>
      </fieldset>

      <div>
        <label htmlFor="family_name_en" className="block text-xs text-gray-500 mb-1">Family name (EN)</label>
        <input id="family_name_en" name="family_name_en" defaultValue={initialData?.family_name_en ?? ""} placeholder="e.g. Ahlak" className={INPUT_CLS} />
      </div>

      <div>
        <label htmlFor="father_name_en" className="block text-xs text-gray-500 mb-1">Father name (EN)</label>
        <input id="father_name_en" name="father_name_en" defaultValue={initialData?.father_name_en ?? ""} className={INPUT_CLS} />
      </div>

      <div>
        <label htmlFor="grandfather_name_en" className="block text-xs text-gray-500 mb-1">Grandfather name (EN)</label>
        <input id="grandfather_name_en" name="grandfather_name_en" defaultValue={initialData?.grandfather_name_en ?? ""} className={INPUT_CLS} />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Gender</p>
        <div className="flex gap-4">
          {(["f", "m"] as const).map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="gender"
                value={g}
                defaultChecked={
                  initialData?.gender === "f" || initialData?.gender === "m"
                    ? initialData.gender === g
                    : g === "m"
                }
                className="accent-amber-500"
              />
              {GENDER_LABELS[g].en}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ParentPickerField
          label="Father"
          placeholder="Pick…"
          name="father_id"
          value={fatherId}
          person={fatherId ? peopleById.get(fatherId) : undefined}
          onOpen={() => setParentPicker("father")}
          onClear={() => setFatherId(null)}
          lang={lang}
        />
        <ParentPickerField
          label="Mother"
          placeholder="Pick…"
          name="mother_id"
          value={motherId}
          person={motherId ? peopleById.get(motherId) : undefined}
          onOpen={() => setParentPicker("mother")}
          onClear={() => setMotherId(null)}
          lang={lang}
        />
      </div>
      {parentPicker && (
        <PersonPicker
          open
          onOpenChange={(o) => { if (!o) setParentPicker(null); }}
          title={parentPicker === "father" ? "Pick a father" : "Pick a mother"}
          description="Search by name"
          people={people as PickablePerson[]}
          lang={lang}
          excludeIds={initialData?.id ? [initialData.id] : []}
          onPick={(pickedId) => {
            if (parentPicker === "father") setFatherId(pickedId);
            else setMotherId(pickedId);
          }}
        />
      )}

      <div>
        <label htmlFor="notes_en" className="block text-xs text-gray-500 mb-1">Notes</label>
        <textarea
          id="notes_en"
          name="notes_en"
          defaultValue={initialData?.notes_en ?? ""}
          rows={3}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="birth_date" className="block text-xs text-gray-500 mb-1">Birth date</label>
          <input
            type="date"
            id="birth_date"
            name="birth_date"
            defaultValue={initialData?.birth_date ?? ""}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label htmlFor="death_date" className="block text-xs text-gray-500 mb-1">Death date</label>
          <input
            type="date"
            id="death_date"
            name="death_date"
            defaultValue={initialData?.death_date ?? ""}
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Preserve existing Arabic data as hidden fields so it isn't wiped on save */}
      <input type="hidden" name="given_ar" value={initialData?.given_ar ?? ""} />
      <input type="hidden" name="family_name_ar" value={initialData?.family_name_ar ?? ""} />
      <input type="hidden" name="father_name_ar" value={initialData?.father_name_ar ?? ""} />
      <input type="hidden" name="grandfather_name_ar" value={initialData?.grandfather_name_ar ?? ""} />
      <input type="hidden" name="notes_ar" value={initialData?.notes_ar ?? ""} />
      <input type="hidden" name="is_placeholder" value="false" />
      <input type="hidden" name="great_grandfather_name_en" value={initialData?.great_grandfather_name_en ?? ""} />
      <input type="hidden" name="great_grandfather_name_ar" value={initialData?.great_grandfather_name_ar ?? ""} />

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function ParentPickerField({
  label,
  placeholder,
  name,
  value,
  person,
  onOpen,
  onClear,
  lang,
}: {
  label: string;
  placeholder: string;
  name: string;
  value: string | null;
  person?: PickablePerson;
  onOpen: () => void;
  onClear: () => void;
  lang: "ar" | "en";
}) {
  const display = person
    ? (lang === "ar"
        ? person.given_ar ?? person.given_en
        : person.given_en ?? person.given_ar) ?? "—"
    : null;
  const initials = person
    ? (((lang === "ar" ? person.given_ar : person.given_en) ?? "?")[0] ?? "?").toUpperCase() +
      (((lang === "ar" ? person.family_name_ar : person.family_name_en) ?? "")[0] ?? "").toUpperCase()
    : "?";

  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="group flex h-10 flex-1 items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm shadow-sm transition-[background-color,border-color] hover:border-[var(--accent)]/60 hover:bg-[var(--muted)]/40"
        >
          {person ? (
            <>
              <Avatar className="h-7 w-7 ring-2 ring-[var(--border)]">
                {person.photo_url && (
                  <AvatarImage src={person.photo_url} alt={display ?? ""} className="object-cover" />
                )}
                <AvatarFallback className="text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-left text-[var(--foreground)]">
                {display}
              </span>
            </>
          ) : (
            <span className="text-[var(--muted-foreground)]">{placeholder}</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] transition-[background-color,color] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
