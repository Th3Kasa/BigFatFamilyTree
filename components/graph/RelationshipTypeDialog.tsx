"use client";

import { useMemo, useState } from "react";
import {
  Baby,
  Heart,
  HeartCrack,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getDisplayName } from "@/lib/utils";
import type { PickablePerson } from "./PersonPicker";

export type RelationshipChoice =
  | "parent"      // source IS parent of target
  | "child"       // source IS child of target
  | "spouse"      // current spouse
  | "ex_spouse"   // divorced spouse
  | "sibling"
  | "adopted"     // source is adoptive parent of target
  | "guardian"    // source is guardian/raised-by of target
  | "unknown";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PickablePerson | null;
  target: PickablePerson | null;
  lang: "ar" | "en";
  preselect?: RelationshipChoice;
  onChoose: (choice: RelationshipChoice) => void | Promise<void>;
  onCancel?: () => void;
};

function display(p: PickablePerson | null, lang: "ar" | "en") {
  if (!p) return lang === "ar" ? "؟" : "?";
  return getDisplayName(p, lang);
}

function initials(p: PickablePerson | null, lang: "ar" | "en") {
  if (!p) return "?";
  const given =
    lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar;
  const family =
    lang === "ar"
      ? p.family_name_ar ?? p.family_name_en
      : p.family_name_en ?? p.family_name_ar;
  return (
    ((given ?? "?")[0] ?? "?").toUpperCase() +
    ((family ?? "")[0] ?? "").toUpperCase()
  );
}

export function RelationshipTypeDialog({
  open,
  onOpenChange,
  source,
  target,
  lang,
  preselect,
  onChoose,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState<RelationshipChoice | null>(null);

  const srcName = display(source, lang);
  const tgtName = display(target, lang);

  const choices = useMemo(
    () =>
      [
        {
          key: "parent" as RelationshipChoice,
          Icon: UserPlus,
          title: lang === "ar" ? "والد/ة لـ" : "Parent of",
          subtitle: lang === "ar" ? `${srcName} هو والد ${tgtName}` : `${srcName} is the parent of ${tgtName}`,
          accent: "burgundy",
        },
        {
          key: "child" as RelationshipChoice,
          Icon: Baby,
          title: lang === "ar" ? "طفل لـ" : "Child of",
          subtitle: lang === "ar" ? `${srcName} هو طفل ${tgtName}` : `${srcName} is the child of ${tgtName}`,
          accent: "burgundy",
        },
        {
          key: "spouse" as RelationshipChoice,
          Icon: Heart,
          title: lang === "ar" ? "زوج/ة" : "Spouse",
          subtitle: lang === "ar" ? "علاقة حالية" : "Currently married",
          accent: "rose",
        },
        {
          key: "ex_spouse" as RelationshipChoice,
          Icon: HeartCrack,
          title: lang === "ar" ? "زوج/ة سابق/ة" : "Ex-spouse",
          subtitle: lang === "ar" ? "مطلق/ة" : "Divorced",
          accent: "muted",
        },
        {
          key: "sibling" as RelationshipChoice,
          Icon: Users,
          title: lang === "ar" ? "شقيق/ة" : "Sibling",
          subtitle: lang === "ar" ? "يتشاركان والداً" : "Shares a parent",
          accent: "coral",
        },
        {
          key: "adopted" as RelationshipChoice,
          Icon: Sparkles,
          title: lang === "ar" ? "والد بالتبني" : "Adoptive parent",
          subtitle: lang === "ar" ? `${srcName} هو والد بالتبني لـ ${tgtName}` : `${srcName} adopted ${tgtName}`,
          accent: "coral",
        },
        {
          key: "guardian" as RelationshipChoice,
          Icon: ShieldCheck,
          title: lang === "ar" ? "ولي أمر" : "Guardian",
          subtitle: lang === "ar" ? `${srcName} رَبَّى ${tgtName}` : `${srcName} raised ${tgtName}`,
          accent: "muted",
        },
        {
          key: "unknown" as RelationshipChoice,
          Icon: HelpCircle,
          title: lang === "ar" ? "غير معروف" : "Unknown",
          subtitle: lang === "ar" ? "إلغاء بدون ربط" : "Cancel without linking",
          accent: "muted",
        },
      ] as const,
    [srcName, tgtName, lang],
  );

  async function handle(key: RelationshipChoice) {
    setBusy(key);
    try {
      await onChoose(key);
    } finally {
      setBusy(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onCancel?.();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="glass-2 max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle
            className="text-lg font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {lang === "ar"
              ? `كيف يرتبط ${srcName} بـ ${tgtName}؟`
              : `How is ${srcName} related to ${tgtName}?`}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted-foreground)]">
            {lang === "ar"
              ? "اختر نوع العلاقة"
              : "Pick the relationship type"}
          </DialogDescription>
        </DialogHeader>

        {/* Source / target preview */}
        <div className="flex items-center justify-center gap-4 border-y border-[var(--border)] bg-[var(--muted)]/35 px-5 py-3 text-xs">
          <PreviewChip person={source} label={srcName} initials={initials(source, lang)} />
          <span aria-hidden className="text-[var(--muted-foreground)]">
            →
          </span>
          <PreviewChip person={target} label={tgtName} initials={initials(target, lang)} />
        </div>

        {/* Choices */}
        <div className="grid grid-cols-2 gap-2 p-5">
          {choices.map(({ key, Icon, title, subtitle, accent }) => {
            const isBusy = busy === key;
            const isHero = key === preselect;
            const accentRing =
              accent === "rose"
                ? "hover:border-rose-300 hover:bg-rose-50/60"
                : accent === "coral"
                  ? "hover:border-[oklch(0.86_0.10_38)] hover:bg-[oklch(0.96_0.04_60)]"
                  : accent === "burgundy"
                    ? "hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/6"
                    : "hover:border-[var(--border)] hover:bg-[var(--muted)]";
            return (
              <button
                key={key}
                type="button"
                disabled={busy !== null}
                onClick={() => handle(key)}
                className={cn(
                  "group flex flex-col items-start gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-left transition-[transform,background-color,border-color,box-shadow] duration-200",
                  "hover:-translate-y-px hover:shadow-[var(--shadow-floating)]",
                  accentRing,
                  isHero && "border-[var(--primary)]/60 shadow-[var(--shadow-glow)] ring-2 ring-[var(--primary)]/40",
                  isBusy && "opacity-70",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] transition-[background-color,color] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-foreground)]",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {title}
                  </span>
                </div>
                <span className="line-clamp-2 text-[11px] leading-snug text-[var(--muted-foreground)]">
                  {subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewChip({
  person,
  label,
  initials,
}: {
  person: PickablePerson | null;
  label: string;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-1 shadow-sm">
      <Avatar className="h-6 w-6">
        {person?.photo_url && (
          <AvatarImage src={person.photo_url} alt={label} className="object-cover" />
        )}
        <AvatarFallback className="text-[9px] font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium text-[var(--foreground)]">{label}</span>
    </div>
  );
}
