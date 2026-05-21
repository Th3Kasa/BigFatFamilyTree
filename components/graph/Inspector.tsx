"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { motion } from "framer-motion";
import { PlusCircle, ExternalLink, Pencil, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarPhotoUpload } from "@/components/forms/AvatarPhotoUpload";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deletePerson } from "@/lib/actions/people";
import type { PersonInput } from "@/lib/graph/transform";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};
const sectionTransition = { duration: 0.32, ease: [0.32, 0.72, 0.32, 1] as const };

type Props = {
  person: PersonInput | null;
  lang: "ar" | "en";
  onClose: () => void;
  fatherName?: string | null;
  motherName?: string | null;
};

export function Inspector({ person, lang, onClose, fatherName, motherName }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleDelete() {
    if (!person) return;
    const confirmed = window.confirm(
      lang === "ar" ? "هل تريد حذف هذا الشخص؟" : "Delete this person?"
    );
    if (!confirmed) return;
    const id = person.id;
    onClose();
    startTransition(async () => {
      await deletePerson(id);
      router.refresh();
    });
  }
  const open = person !== null;

  const givenName = person
    ? lang === "ar"
      ? (person.given_ar ?? person.given_en ?? "?")
      : (person.given_en ?? person.given_ar ?? "?")
    : "";

  const familyName = person
    ? lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en ?? "")
      : (person.family_name_en ?? person.family_name_ar ?? "")
    : "";

  const fullName = [givenName, familyName].filter(Boolean).join(" ");
  const initials = givenName.charAt(0).toUpperCase() + (familyName.charAt(0) ?? "").toUpperCase();

  const genderLabel =
    person?.gender === "f"
      ? lang === "ar" ? "أنثى" : "Female"
      : person?.gender === "m"
        ? lang === "ar" ? "ذكر" : "Male"
        : lang === "ar" ? "غير محدد" : "Unknown";

  const avatarRingColor =
    person?.gender === "f"
      ? "ring-rose-200"
      : person?.gender === "m"
        ? "ring-sky-200"
        : "ring-border";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="glass-2 w-[22rem] sm:max-w-[22rem] flex flex-col gap-0 p-0 border-s border-[var(--border)] shadow-[var(--shadow-deep)]"
      >
        {/* Decorative top sheen — burgundy → accent → transparent */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--primary)] via-[var(--accent)] to-transparent opacity-90"
        />

        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-5 border-b border-[var(--border)]">
          <motion.div
            initial={fadeUp.initial}
            animate={fadeUp.animate}
            transition={sectionTransition}
            className="flex items-start gap-4"
          >
            {person ? (
              <AvatarPhotoUpload
                personId={person.id}
                currentUrl={person.photo_url}
                alt={fullName}
                initials={initials}
                fallbackGender={person.gender}
                sizeClass="h-16 w-16"
                wrapperClassName={cn("ring-2", avatarRingColor)}
                lang={lang}
              />
            ) : null}
            <div className="flex-1 min-w-0 pt-0.5">
              <SheetTitle
                className="truncate text-xl font-semibold leading-tight tracking-tight"
                style={{ fontFamily: "var(--font-display)", fontOpticalSizing: "auto" }}
              >
                {fullName || (lang === "ar" ? "شخص" : "Person")}
              </SheetTitle>
              <Badge
                variant="outline"
                className={cn(
                  "mt-2 rounded-full px-2.5 text-[10px] uppercase tracking-wider",
                  person?.gender === "f" && "border-rose-200/80 bg-rose-50/80 text-rose-600",
                  person?.gender === "m" && "border-sky-200/80 bg-sky-50/80 text-sky-600",
                )}
              >
                {genderLabel}
              </Badge>
            </div>
          </motion.div>
        </SheetHeader>

        {/* Body */}
        <motion.div
          initial="initial"
          animate="animate"
          variants={{ animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }}
          className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6"
        >
          {/* Placeholder notice */}
          {person?.is_placeholder && (
            <motion.div
              variants={fadeUp}
              transition={sectionTransition}
              className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/55 p-3"
            >
              <p className="text-center text-xs text-[var(--muted-foreground)]">
                {lang === "ar" ? "شخص مبهم — أضف معلوماته" : "Placeholder — add their info"}
              </p>
            </motion.div>
          )}

          {/* Family links */}
          {(person?.father_id || person?.mother_id) && (
            <motion.div variants={fadeUp} transition={sectionTransition} className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                {lang === "ar" ? "الوالدان" : "Parents"}
              </p>
              <div className="flex flex-wrap gap-2">
                {person?.father_id && (
                  <Badge variant="secondary" className="gap-1 rounded-full bg-[var(--secondary)] px-3 py-1 text-xs">
                    <span className="text-[var(--muted-foreground)]">{lang === "ar" ? "الأب:" : "Father:"}</span>
                    {fatherName ?? (lang === "ar" ? "غير معروف" : "Unknown")}
                  </Badge>
                )}
                {person?.mother_id && (
                  <Badge variant="secondary" className="gap-1 rounded-full bg-[var(--secondary)] px-3 py-1 text-xs">
                    <span className="text-[var(--muted-foreground)]">{lang === "ar" ? "الأم:" : "Mother:"}</span>
                    {motherName ?? (lang === "ar" ? "غير معروف" : "Unknown")}
                  </Badge>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Footer actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0.32, 1], delay: 0.18 }}
          className="space-y-2 border-t border-[var(--border)] px-6 py-5"
        >
          <Button asChild size="sm" className="w-full rounded-full">
            <Link href={person ? `/person/${person.slug ?? person.id}/edit` : "#"}>
              <Pencil className="h-3.5 w-3.5" />
              {lang === "ar" ? "تعديل" : "Edit"}
            </Link>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link
                href={
                  person
                    ? `/person/new?${person.gender === "f" ? "mother" : "father"}=${person.id}`
                    : "#"
                }
              >
                <PlusCircle className="h-3.5 w-3.5" />
                {lang === "ar" ? "إضافة طفل" : "Add child"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href={person ? `/person/new?spouse=${person.id}` : "#"}>
                <UserPlus className="h-3.5 w-3.5" />
                {lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
              </Link>
            </Button>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full rounded-full">
            <Link href={person ? `/person/${person.slug ?? person.id}` : "#"}>
              <ExternalLink className="h-3.5 w-3.5" />
              {lang === "ar" ? "الصفحة الكاملة" : "Full profile"}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full border-[var(--destructive)]/30 text-[var(--destructive)] hover:bg-[var(--destructive)]/5 hover:text-[var(--destructive)]"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {lang === "ar" ? "حذف" : "Delete"}
          </Button>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
