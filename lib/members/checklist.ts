// "Finish your profile": the five things a new member can do, as pure data.
// lib/members/checklist-data.ts gathers the facts; components/members/ProfileChecklist.tsx renders it.

export type ChecklistKey = "photo" | "birthday" | "parents" | "memory" | "invite";

export type ChecklistFacts = {
  /** Slug or id used in /person/<x>. */
  personRef: string;
  /** Editors and admins can change the tree; viewers ask or suggest instead. */
  canEdit: boolean;
  hasPhoto: boolean;
  /** The linked person has a birth date on file. */
  hasBirthDate: boolean;
  /** At least one parent is set on the linked person. */
  hasParents: boolean;
  /** The member has contributed a story or event. */
  hasMemory: boolean;
  /** The member has suggested at least one relative. */
  invitedRelative: boolean;
};

export type ChecklistItem = {
  key: ChecklistKey;
  done: boolean;
  title: { en: string; ar: string };
  hint: { en: string; ar: string };
  /** Where the button goes; null = nothing to open (done, or ask an admin). */
  href: string | null;
  action: { en: string; ar: string } | null;
};

export type ChecklistData = {
  items: ChecklistItem[];
  done: number;
  total: number;
};

export function buildChecklist(f: ChecklistFacts): ChecklistData {
  const edit = `/person/${f.personRef}/edit`;
  const items: ChecklistItem[] = [
    {
      key: "photo",
      done: f.hasPhoto,
      title: { en: "Add a profile photo", ar: "أضف صورة شخصية" },
      hint: f.canEdit
        ? { en: "So cousins recognise you in the tree.", ar: "ليتعرّف عليك أبناء العم في الشجرة." }
        : { en: "Ask an admin to add your photo.", ar: "اطلب من المشرف إضافة صورتك." },
      href: f.canEdit && !f.hasPhoto ? edit : null,
      action: f.canEdit && !f.hasPhoto ? { en: "Add photo", ar: "أضف صورة" } : null,
    },
    {
      key: "birthday",
      done: f.hasBirthDate,
      title: { en: "Check your birthday", ar: "تحقق من تاريخ ميلادك" },
      hint: f.canEdit
        ? { en: "Make sure the date in the tree is right.", ar: "تأكد أن التاريخ في الشجرة صحيح." }
        : { en: "Ask an admin to add or correct it.", ar: "اطلب من المشرف إضافته أو تصحيحه." },
      href: f.canEdit && !f.hasBirthDate ? edit : null,
      action: f.canEdit && !f.hasBirthDate ? { en: "Check it", ar: "تحقق" } : null,
    },
    {
      key: "parents",
      done: f.hasParents,
      title: { en: "Add your parents", ar: "أضف والديك" },
      hint: f.canEdit
        ? { en: "Connect your branch to the rest of the family.", ar: "اربط فرعك ببقية العائلة." }
        : { en: "Not in the tree yet? Suggest them and an admin adds them.", ar: "ليسوا في الشجرة؟ اقترحهم وسيضيفهم المشرف." },
      href: f.hasParents ? null : f.canEdit ? edit : "/welcome#suggest",
      action: f.hasParents ? null : f.canEdit ? { en: "Add parents", ar: "أضف الوالدين" } : { en: "Suggest them", ar: "اقترحهم" },
    },
    {
      key: "memory",
      done: f.hasMemory,
      title: { en: "Share a memory", ar: "شارك ذكرى" },
      hint: { en: "A story, a trip, a recipe. Anything worth keeping.", ar: "قصة أو رحلة أو وصفة. أي شيء يستحق الحفظ." },
      href: f.hasMemory ? null : `/person/${f.personRef}/event/new`,
      action: f.hasMemory ? null : { en: "Add a memory", ar: "أضف ذكرى" },
    },
    {
      key: "invite",
      done: f.invitedRelative,
      title: { en: "Invite a relative", ar: "ادعُ أحد أقاربك" },
      hint: { en: "Know someone who isn't here yet? Bring them in.", ar: "تعرف أحدًا ليس هنا بعد؟ ادعه للانضمام." },
      href: f.invitedRelative ? null : "/welcome#invite",
      action: f.invitedRelative ? null : { en: "Invite", ar: "ادعُ" },
    },
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

/** "3 of 5 done" / "٣ من ٥". */
export function progressLabel(done: number, total: number, lang: "ar" | "en"): string {
  return lang === "ar" ? `${done} من ${total}` : `${done} of ${total} done`;
}
