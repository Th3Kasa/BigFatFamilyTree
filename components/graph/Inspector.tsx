"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PlusCircle, ExternalLink, Pencil, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deletePerson } from "@/lib/actions/people";
import type { PersonInput } from "@/lib/graph/transform";

type Props = {
  person: PersonInput | null;
  lang: "ar" | "en";
  onClose: () => void;
};

export function Inspector({ person, lang, onClose }: Props) {
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
        className="w-80 sm:max-w-80 flex flex-col gap-0 p-0 border-s border-border"
      >
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <Avatar className={cn("h-14 w-14 shrink-0 ring-2", avatarRingColor)}>
              {person?.photo_url && (
                <AvatarImage src={person.photo_url} alt={fullName} className="object-cover" />
              )}
              <AvatarFallback className="text-base font-semibold bg-muted">
                {initials || (person?.gender === "f" ? "♀" : "♂")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle
                className="text-base font-bold leading-tight truncate"
                style={{ fontFamily: "var(--font-display, 'Fraunces Variable', serif)" }}
              >
                {fullName || (lang === "ar" ? "شخص" : "Person")}
              </SheetTitle>
              <Badge
                variant="outline"
                className={cn(
                  "mt-1.5 text-xs",
                  person?.gender === "f" && "border-rose-200 text-rose-600 bg-rose-50",
                  person?.gender === "m" && "border-sky-200 text-sky-600 bg-sky-50"
                )}
              >
                {genderLabel}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Placeholder notice */}
          {person?.is_placeholder && (
            <div className="rounded-lg border border-dashed border-border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground text-center">
                {lang === "ar" ? "شخص مبهم — أضف معلوماته" : "Placeholder — add their info"}
              </p>
            </div>
          )}

          {/* Birth / death dates (stored in family tree as part of person profile — show id for now as placeholder until fields added) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {lang === "ar" ? "المعرّف" : "ID"}
            </p>
            <p className="text-sm text-foreground font-mono break-all select-all">
              {person?.id}
            </p>
          </div>

          {/* Family links */}
          {(person?.father_id || person?.mother_id) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {lang === "ar" ? "الوالدان" : "Parents"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {person?.father_id && (
                  <Badge variant="secondary" className="text-xs">
                    {lang === "ar" ? "الأب" : "Father"}
                  </Badge>
                )}
                {person?.mother_id && (
                  <Badge variant="secondary" className="text-xs">
                    {lang === "ar" ? "الأم" : "Mother"}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 pt-4 border-t border-border space-y-2">
          <Button asChild className="w-full" size="sm">
            <Link href={person ? `/person/${person.slug ?? person.id}/edit` : "#"}>
              <Pencil className="w-3.5 h-3.5" />
              {lang === "ar" ? "تعديل" : "Edit"}
            </Link>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={
                  person
                    ? `/person/new?${person.gender === "f" ? "mother" : "father"}=${person.id}`
                    : "#"
                }
              >
                <PlusCircle className="w-3.5 h-3.5" />
                {lang === "ar" ? "إضافة طفل" : "Add child"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={person ? `/person/new?spouse=${person.id}` : "#"}>
                <UserPlus className="w-3.5 h-3.5" />
                {lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
              </Link>
            </Button>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={person ? `/person/${person.slug ?? person.id}` : "#"}>
              <ExternalLink className="w-3.5 h-3.5" />
              {lang === "ar" ? "الصفحة الكاملة" : "Full profile"}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={handleDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {lang === "ar" ? "حذف" : "Delete"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
