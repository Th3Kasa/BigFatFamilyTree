"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, PlusCircle, ExternalLink, Pencil, Trash2, UserPlus, Heart, Link2Off, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarPhotoUpload } from "@/components/forms/AvatarPhotoUpload";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deletePersonCanvas,
  unlinkParent,
  convertParentToSpouse,
  linkSpouse,
  linkChild,
  linkParentChild,
  addSibling,
  createPersonQuick,
  type ActionState,
} from "@/lib/actions/people";
import {
  deleteRelationship,
  updateRelationshipStatus,
} from "@/lib/actions/relationships";
import { PersonPicker, type PickablePerson } from "./PersonPicker";
import type {
  GraphEdge,
  PersonInput,
  SpouseStatus,
} from "@/lib/graph/transform";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};
const sectionTransition = { duration: 0.32, ease: [0.32, 0.72, 0.32, 1] as const };

// ── Inline Quick-Add ──────────────────────────────────────────────────────────

type QuickAddKind = "spouse" | "child" | "parent" | "sibling";

const quickAddLabels: Record<QuickAddKind, string> = {
  spouse:  "spouse for",
  child:   "child of",
  parent:  "parent of",
  sibling: "sibling of",
};

function QuickAddSaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      className="w-full rounded-full"
    >
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

type InlineQuickAddProps = {
  kind: QuickAddKind;
  personName: string;
  person: PersonInput;
  onBack: () => void;
  onLinkExisting: () => void;
  onSuccess: () => void;
};

function InlineQuickAdd({
  kind,
  personName,
  person,
  onBack,
  onLinkExisting,
  onSuccess,
}: InlineQuickAddProps) {
  const [formState, formAction] = useActionState<ActionState, FormData>(createPersonQuick, null);
  const givenRef = useRef<HTMLInputElement>(null);

  // Autofocus when mounted
  useEffect(() => {
    const t = setTimeout(() => givenRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Close and refresh on success
  useEffect(() => {
    if (formState?.success) {
      onSuccess();
    }
  }, [formState?.success, onSuccess]);

  // Derive hidden FK values
  const fatherId = kind === "child" && person.gender !== "f" ? person.id : "";
  const motherId = kind === "child" && person.gender === "f" ? person.id : "";
  const spouseId = kind === "spouse" ? person.id : "";
  const childId  = kind === "parent" ? person.id : "";
  // For sibling: pass same father_id / mother_id as the current person
  const sibFatherId = kind === "sibling" ? (person.father_id ?? "") : "";
  const sibMotherId = kind === "sibling" ? (person.mother_id ?? "") : "";

  const resolvedFatherId = kind === "sibling" ? sibFatherId : fatherId;
  const resolvedMotherId = kind === "sibling" ? sibMotherId : motherId;

  const showGender = kind !== "spouse";
  const contextLabel = `Adding ${quickAddLabels[kind]} ${personName}`;

  return (
    <motion.div
      key="quick-add-panel"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0.32, 1] }}
      className="absolute inset-0 flex flex-col bg-[var(--background,white)] dark:bg-[var(--background)]"
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
            "transition-[transform,background-color,color] duration-200",
            "hover:-translate-y-px hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs text-[var(--muted-foreground)] leading-tight capitalize">
            {contextLabel}
          </p>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <form action={formAction} className="space-y-4">
          {/* Error message */}
          {formState && !formState.success && formState.error && (
            <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 px-3 py-2">
              <p className="text-xs text-[var(--destructive)]">{formState.error}</p>
            </div>
          )}

          {/* Given name */}
          <div className="space-y-1.5">
            <label
              htmlFor="quick-given"
              className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
            >
              Given name <span className="text-[var(--destructive)]">*</span>
            </label>
            <input
              ref={givenRef}
              id="quick-given"
              name="given_en"
              required
              autoComplete="off"
              placeholder="e.g. Sarah"
              className={cn(
                "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm",
                "placeholder:text-[var(--muted-foreground)]/50",
                "outline-none ring-0 transition-shadow duration-200",
                "focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20",
              )}
            />
            {formState?.fieldErrors?.given_en && (
              <p className="text-xs text-[var(--destructive)]">{formState.fieldErrors.given_en}</p>
            )}
          </div>

          {/* Family name */}
          <div className="space-y-1.5">
            <label
              htmlFor="quick-family"
              className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
            >
              Family name
            </label>
            <input
              id="quick-family"
              name="family_name_en"
              autoComplete="off"
              placeholder="Optional"
              className={cn(
                "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm",
                "placeholder:text-[var(--muted-foreground)]/50",
                "outline-none ring-0 transition-shadow duration-200",
                "focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20",
              )}
            />
          </div>

          {/* Gender (not shown for spouse — gender can be any) */}
          {showGender && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Gender
              </p>
              <div className="flex gap-3">
                {(["m", "f"] as const).map((g) => (
                  <label
                    key={g}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[var(--primary)]/5 transition-colors duration-150"
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      defaultChecked={g === "m"}
                      className="accent-[var(--primary)]"
                    />
                    {g === "m" ? "Male" : "Female"}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Gender hidden for spouse */}
          {!showGender && (
            <input type="hidden" name="gender" value="unknown" />
          )}

          {/* Hidden relational FK fields */}
          <input type="hidden" name="father_id"   value={resolvedFatherId} />
          <input type="hidden" name="mother_id"   value={resolvedMotherId} />
          <input type="hidden" name="spouse_id"   value={spouseId} />
          <input type="hidden" name="child_id"    value={childId} />
          <input type="hidden" name="is_placeholder" value="false" />
          <input type="hidden" name="photo_url"   value="" />
          <input type="hidden" name="father_name_en" value="" />
          <input type="hidden" name="father_name_ar" value="" />
          <input type="hidden" name="grandfather_name_en" value="" />
          <input type="hidden" name="grandfather_name_ar" value="" />
          <input type="hidden" name="great_grandfather_name_en" value="" />
          <input type="hidden" name="great_grandfather_name_ar" value="" />
          <input type="hidden" name="family_name_ar" value="" />
          <input type="hidden" name="notes_en"    value="" />
          <input type="hidden" name="notes_ar"    value="" />

          <QuickAddSaveButton />
        </form>

        {/* Secondary: link existing person */}
        <div className="mt-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">or</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <button
          type="button"
          onClick={onLinkExisting}
          className="mt-3 w-full text-center text-xs text-[var(--primary)] underline underline-offset-2 hover:opacity-70 transition-opacity"
        >
          Link existing person
        </button>
      </div>
    </motion.div>
  );
}

function personLabel(p: PickablePerson | undefined, lang: "ar" | "en") {
  if (!p) return "Unknown";
  const given =
    lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar;
  const family =
    lang === "ar"
      ? p.family_name_ar ?? p.family_name_en
      : p.family_name_en ?? p.family_name_ar;
  return given || family || "Unnamed";
}

function personInitials(p: PickablePerson | undefined, lang: "ar" | "en") {
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

function SpouseRow({
  selfId,
  spouse,
  relationshipId,
  status,
  lang,
  onChange,
}: {
  selfId: string;
  spouse: PickablePerson | undefined;
  relationshipId: string;
  status: SpouseStatus;
  lang: "ar" | "en";
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const name = personLabel(spouse, lang);

  const statusLabels: Record<SpouseStatus, string> = {
    current: "Married",
    divorced: "Divorced",
    widowed: "Widowed",
  };

  const statusStyles: Record<SpouseStatus, string> = {
    current: "bg-[var(--highlight)]/10 text-[var(--highlight)] border-[var(--highlight)]/30",
    divorced:
      "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
    widowed: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
  };

  async function setStatus(next: SpouseStatus) {
    if (next === status) return;
    setBusy(true);
    const r = await updateRelationshipStatus(relationshipId, next);
    setBusy(false);
    if (r.success) {
      toast.success(`Status updated: ${statusLabels[next]}`);
    } else {
      toast.error(r.error ?? "Update failed");
    }
    onChange();
  }

  async function handleRemove() {
    if (!removeConfirm) {
      setRemoveConfirm(true);
      return;
    }
    setRemoveConfirm(false);
    setBusy(true);
    const r = await deleteRelationship(relationshipId, selfId);
    setBusy(false);
    if (r?.success) {
      toast.success("Marriage removed");
    } else {
      toast.error((r as { error?: string } | null)?.error ?? "Remove failed");
    }
    onChange();
  }

  return (
    <div className="group flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm">
      <Avatar className="h-9 w-9 ring-2 ring-rose-200/80">
        {spouse?.photo_url && (
          <AvatarImage src={spouse.photo_url} alt={name} className="object-cover" />
        )}
        <AvatarFallback className="text-[10px] font-semibold bg-rose-50 text-rose-500">
          {personInitials(spouse, lang)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-[var(--foreground)]">
          {name}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "mt-0.5 w-fit rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.14em]",
            statusStyles[status],
          )}
        >
          {statusLabels[status]}
        </Badge>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label="Change status"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
              "transition-[transform,background-color,color] duration-200",
              "hover:-translate-y-px hover:bg-[var(--highlight)] hover:text-[var(--highlight-foreground)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Heart className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {(["current", "divorced", "widowed"] as SpouseStatus[]).map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "text-xs",
                status === s && "font-semibold",
              )}
            >
              {statusLabels[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={handleRemove}
        onBlur={() => setRemoveConfirm(false)}
        disabled={busy}
        aria-label={removeConfirm ? "Confirm removal" : "Remove"}
        title={removeConfirm ? "Confirm?" : "Remove"}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border transition-[transform,background-color,color] duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          removeConfirm
            ? "border-[var(--destructive)] bg-[var(--destructive)] text-white hover:-translate-y-px"
            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:-translate-y-px hover:bg-[var(--destructive)] hover:text-white",
        )}
      >
        <Link2Off className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function KinRow({
  person,
  lang,
  accent = "neutral",
}: {
  person: PickablePerson;
  lang: "ar" | "en";
  accent?: "rose" | "coral" | "neutral";
}) {
  const ringClass =
    accent === "rose"
      ? "ring-rose-200/80"
      : accent === "coral"
        ? "ring-[oklch(0.86_0.07_38)]/70"
        : "ring-[var(--border)]";

  return (
    <Link
      href={`/person/${person.slug ?? person.id}`}
      className="group flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-[var(--muted)]/40"
    >
      <Avatar className={cn("h-8 w-8 ring-2", ringClass)}>
        {person.photo_url && (
          <AvatarImage
            src={person.photo_url}
            alt={personLabel(person, lang)}
            className="object-cover"
          />
        )}
        <AvatarFallback className="text-[10px] font-semibold">
          {personInitials(person, lang)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium text-[var(--foreground)]">
        {personLabel(person, lang)}
      </span>
    </Link>
  );
}

function ParentRow({
  label,
  name,
  parentId,
  childId,
  lang,
  onChange,
}: {
  label: string;
  name: string | null | undefined;
  parentId: string;
  childId: string;
  lang: "ar" | "en";
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);
  const [convertConfirm, setConvertConfirm] = useState(false);

  async function handleUnlink() {
    if (!unlinkConfirm) {
      setUnlinkConfirm(true);
      return;
    }
    setUnlinkConfirm(false);
    setBusy(true);
    const r = await unlinkParent(parentId, childId);
    setBusy(false);
    if (r?.success) {
      toast.success("Parent link removed");
    } else {
      toast.error(r?.error ?? "Remove failed");
    }
    onChange();
  }

  async function handleConvert() {
    if (!convertConfirm) {
      setConvertConfirm(true);
      return;
    }
    setConvertConfirm(false);
    setBusy(true);
    const r = await convertParentToSpouse(parentId, childId);
    setBusy(false);
    if (r?.success) {
      toast.success("Converted to spouse");
    } else {
      toast.error(r?.error ?? "Convert failed");
    }
    onChange();
  }

  return (
    <div className="group flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm">
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className="truncate text-sm font-medium text-[var(--foreground)]">
          {name ?? "Unknown"}
        </span>
      </div>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleConvert}
              disabled={busy}
              aria-label="Convert to spouse"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
                "transition-[transform,background-color,color] duration-200",
                "hover:-translate-y-px hover:bg-[var(--highlight)] hover:text-[var(--highlight-foreground)]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Heart className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Convert to spouse
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={busy}
              aria-label="Unlink"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
                "transition-[transform,background-color,color] duration-200",
                "hover:-translate-y-px hover:bg-[var(--destructive)] hover:text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Link2Off className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Unlink
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

type Props = {
  person: PersonInput | null;
  lang: "ar" | "en";
  onClose: () => void;
  fatherName?: string | null;
  motherName?: string | null;
  people?: PickablePerson[];
  edges?: GraphEdge[];
};

type PickerKind = "spouse" | "child" | "parent" | "sibling" | null;

export function Inspector({
  person,
  lang,
  onClose,
  fatherName,
  motherName,
  people = [],
  edges = [],
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [picker, setPicker] = useState<PickerKind>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddKind | null>(null);

  // Reset picker and quickAdd state when the selected person changes
  useEffect(() => {
    setPicker(null);
    setQuickAdd(null);
  }, [person?.id]);

  const peopleById = useMemo(() => {
    const m = new Map<string, PickablePerson>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  // Spouses derived from edges (spouse-kind only)
  const spouses = useMemo(() => {
    if (!person) return [] as { otherId: string; relationshipId: string; status: SpouseStatus }[];
    const out: { otherId: string; relationshipId: string; status: SpouseStatus }[] = [];
    for (const e of edges) {
      if (e.data?.edgeKind !== "spouse") continue;
      if (e.source !== person.id && e.target !== person.id) continue;
      const otherId = e.source === person.id ? e.target : e.source;
      out.push({
        otherId,
        relationshipId: e.data.relationshipId ?? "",
        status: (e.data.status ?? "current") as SpouseStatus,
      });
    }
    return out;
  }, [edges, person]);

  // Children inferred from people (father_id or mother_id matches)
  const children = useMemo(() => {
    if (!person) return [] as PickablePerson[];
    return people.filter(
      (p) =>
        p.id !== person.id &&
        ((p as PersonInput).father_id === person.id ||
          (p as PersonInput).mother_id === person.id),
    );
  }, [people, person]);

  // Siblings inferred via shared parent
  const siblings = useMemo(() => {
    if (!person) return [] as PickablePerson[];
    if (!person.father_id && !person.mother_id) return [];
    const seen = new Set<string>();
    return people.filter((p) => {
      if (p.id === person.id || seen.has(p.id)) return false;
      const pp = p as PersonInput;
      const sharedFather = person.father_id && pp.father_id === person.father_id;
      const sharedMother = person.mother_id && pp.mother_id === person.mother_id;
      if (sharedFather || sharedMother) {
        seen.add(p.id);
        return true;
      }
      return false;
    });
  }, [people, person]);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  function handleDelete() {
    if (!person) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleteConfirm(false);
    const id = person.id;
    startTransition(async () => {
      const r = await deletePersonCanvas(id);
      if (r.success) {
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? "Delete failed");
      }
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
      ? "Female"
      : person?.gender === "m"
        ? "Male"
        : "Unknown";

  const avatarRingColor =
    person?.gender === "f"
      ? "ring-rose-200"
      : person?.gender === "m"
        ? "ring-sky-200"
        : "ring-border";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setQuickAdd(null); setPicker(null); onClose(); } }}>
      <SheetContent
        side="right"
        className="glass-2 w-full sm:w-[22rem] sm:max-w-[22rem] flex flex-col gap-0 p-0 border-s border-[var(--border)] shadow-[var(--shadow-deep)]"
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
                {fullName || "Person"}
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

        {/* Scrollable body + footer area — absolute panels swap here */}
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {quickAdd && person ? (
              <InlineQuickAdd
                key={quickAdd}
                kind={quickAdd}
                personName={fullName || "Person"}
                person={person}
                onBack={() => setQuickAdd(null)}
                onLinkExisting={() => {
                  setQuickAdd(null);
                  setPicker(quickAdd);
                }}
                onSuccess={() => {
                  setQuickAdd(null);
                  toast.success(
                    quickAdd === "child"   ? "Child added" :
                    quickAdd === "spouse"  ? "Spouse added" :
                    quickAdd === "sibling" ? "Sibling added" :
                                            "Parent added"
                  );
                  router.refresh();
                }}
              />
            ) : (
              <motion.div
                key="inspector-main"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: [0.32, 0.72, 0.32, 1] }}
                className="absolute inset-0 flex flex-col"
              >
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
                        Placeholder — add their info
                      </p>
                    </motion.div>
                  )}

                  {/* Spouses — current + ex with status badges and actions */}
                  {person && spouses.length > 0 && (
                    <motion.div variants={fadeUp} transition={sectionTransition} className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Marriages
                      </p>
                      <div className="space-y-2">
                        {spouses.map((s) => (
                          <SpouseRow
                            key={s.relationshipId || `${s.otherId}-${s.status}`}
                            selfId={person.id}
                            spouse={peopleById.get(s.otherId)}
                            relationshipId={s.relationshipId}
                            status={s.status}
                            lang={lang}
                            onChange={() => {
                              router.refresh();
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Parents — with quick-fix actions */}
                  {person && (person.father_id || person.mother_id) && (
                    <motion.div variants={fadeUp} transition={sectionTransition} className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Parents
                      </p>
                      <div className="space-y-2">
                        {person.father_id && (
                          <ParentRow
                            label="Father"
                            name={fatherName}
                            parentId={person.father_id}
                            childId={person.id}
                            lang={lang}
                            onChange={() => router.refresh()}
                          />
                        )}
                        {person.mother_id && (
                          <ParentRow
                            label="Mother"
                            name={motherName}
                            parentId={person.mother_id}
                            childId={person.id}
                            lang={lang}
                            onChange={() => router.refresh()}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Children */}
                  {person && children.length > 0 && (
                    <motion.div variants={fadeUp} transition={sectionTransition} className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {`Children (${children.length})`}
                      </p>
                      <div className="space-y-2">
                        {children.map((c) => (
                          <KinRow
                            key={c.id}
                            person={c}
                            lang={lang}
                            accent={c.gender === "f" ? "rose" : c.gender === "m" ? "coral" : "neutral"}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Siblings */}
                  {person && siblings.length > 0 && (
                    <motion.div variants={fadeUp} transition={sectionTransition} className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {`Siblings (${siblings.length})`}
                      </p>
                      <div className="space-y-2">
                        {siblings.map((s) => (
                          <KinRow
                            key={s.id}
                            person={s}
                            lang={lang}
                            accent={s.gender === "f" ? "rose" : s.gender === "m" ? "coral" : "neutral"}
                          />
                        ))}
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
                      Edit
                    </Link>
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setQuickAdd("spouse")}
                    >
                      <Heart className="h-3.5 w-3.5" />
                      Add spouse
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setQuickAdd("child")}
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      Add child
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setQuickAdd("sibling")}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Add sibling
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setQuickAdd("parent")}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add parent
                    </Button>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                    <Link href={person ? `/person/${person.slug ?? person.id}` : "#"}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      Full profile
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full rounded-full transition-colors",
                      deleteConfirm
                        ? "border-[var(--destructive)] bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
                        : "border-[var(--destructive)]/30 text-[var(--destructive)] hover:bg-[var(--destructive)]/5 hover:text-[var(--destructive)]",
                    )}
                    onClick={handleDelete}
                    onBlur={() => setDeleteConfirm(false)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleteConfirm ? "Confirm?" : "Delete"}
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>

      {/* Relationship picker — link existing person (secondary flow, no navigation) */}
      {person && picker && (() => {
        const titles: Record<Exclude<PickerKind, null>, string> = {
          spouse:  "Link existing spouse",
          child:   "Link existing child",
          parent:  "Link existing parent",
          sibling: "Link existing sibling",
        };
        const subtitle = "Pick an existing person to link";
        const excludeIds = [person.id];
        const handlePick = async (otherId: string) => {
          const other = peopleById.get(otherId);
          const otherLabel = personLabel(other, lang);
          const selfLabel = personLabel(
            { id: person.id, given_en: person.given_en, given_ar: person.given_ar, family_name_en: person.family_name_en, family_name_ar: person.family_name_ar } as PickablePerson,
            lang,
          );
          let result: { success: boolean; error?: string } | null = null;
          let successMsg = "";
          if (picker === "spouse") {
            result = await linkSpouse(person.id, otherId);
            successMsg = `${otherLabel} linked as ${selfLabel}'s spouse`;
          } else if (picker === "child") {
            result = await linkChild(person.id, otherId);
            successMsg = `${otherLabel} linked as ${selfLabel}'s child`;
          } else if (picker === "parent") {
            result = await linkParentChild(otherId, person.id);
            successMsg = `${otherLabel} linked as ${selfLabel}'s parent`;
          } else if (picker === "sibling") {
            const sibRes = await addSibling(person.id, otherId);
            result = sibRes;
            if (sibRes.success && sibRes.placeholderId) {
              successMsg = `Linked as siblings — added a placeholder parent. Click it to fill in their real parent.`;
            } else {
              successMsg = `${otherLabel} linked as ${selfLabel}'s sibling`;
            }
          }
          if (result?.success) {
            toast.success(successMsg);
            router.refresh();
          } else if (result) {
            toast.error(result.error ?? "Couldn't create the link");
          }
        };
        return (
          <PersonPicker
            open
            onOpenChange={(o) => { if (!o) setPicker(null); }}
            title={titles[picker]}
            description={subtitle}
            people={people}
            lang={lang}
            excludeIds={excludeIds}
            onPick={handlePick}
          />
        );
      })()}
    </Sheet>
  );
}
