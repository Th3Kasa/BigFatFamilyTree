"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Heart, Plus, X } from "lucide-react";
import { cn, getDisplayName, getNameParts } from "@/lib/utils";
import { DIM_OPACITY, type NodeHighlight } from "@/lib/graph/highlight";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/node-size";
import { avatarTone, initialsOf, lifeYears } from "@/lib/people/display";
import { deletePersonCanvas } from "@/lib/actions/people";
import type { PersonNodeData } from "@/lib/graph/transform";

type PersonNodeType = Node<PersonNodeData, "person">;

const HANDLE_BASE: React.CSSProperties = {
  width: 14,
  height: 14,
  borderWidth: 2,
  borderStyle: "solid",
  zIndex: 5,
};

const SPOUSE_STYLE: React.CSSProperties = {
  ...HANDLE_BASE,
  background: "#B4234A",
  borderColor: "#FFFFFF",
  boxShadow: "0 0 0 2px rgb(180 35 74 / 0.22), 0 2px 4px rgb(180 35 74 / 0.30)",
};

const PARENT_STYLE: React.CSSProperties = {
  ...HANDLE_BASE,
  background: "#7A1631",
  borderColor: "#FFFFFF",
  boxShadow: "0 0 0 2px rgb(122 22 49 / 0.22), 0 2px 4px rgb(122 22 49 / 0.30)",
};

const STACKED_TARGET_STYLE: React.CSSProperties = {
  ...HANDLE_BASE,
  background: "transparent",
  borderColor: "transparent",
  boxShadow: "none",
  opacity: 0,
};

const CARD_SIZE: React.CSSProperties = { width: NODE_WIDTH, height: NODE_HEIGHT };

/** Orange ring around people on the highlighted relationship path. */
function pathRing(h: NodeHighlight | undefined): string | undefined {
  if (h?.state !== "on") return undefined;
  return h.step != null
    ? "0 0 0 3px var(--path), 0 0 0 9px var(--path-soft)"
    : "0 0 0 2px var(--path), 0 0 0 7px var(--path-soft)";
}

/** Step number for people on the route; a small tag for shared ancestors off it. */
function PathMarker({ highlight, lang }: { highlight: NodeHighlight | undefined; lang: "ar" | "en" }) {
  if (highlight?.state !== "on") return null;
  if (highlight.step != null) {
    return (
      <span className="absolute -start-3 -top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--path)] text-sm font-bold text-white shadow-md ring-2 ring-white">
        <span className="sr-only">{lang === "ar" ? "الخطوة " : "Step "}</span>
        {highlight.step}
      </span>
    );
  }
  return (
    <span className="absolute start-3 -top-3 z-30 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[var(--path)] shadow-sm ring-1 ring-[var(--path)]">
      {lang === "ar" ? "جدّ مشترك" : "Shared ancestor"}
    </span>
  );
}

const pillClass =
  "flex h-8 items-center justify-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const { person, lang, readOnly, highlight, isMe } = data;
  const dimmed = highlight?.state === "dim";
  const ring = pathRing(highlight);
  const [hovered, setHovered] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleDeletePlaceholder(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleteConfirm(false);
    startTransition(async () => {
      const r = await deletePersonCanvas(person.id);
      if (!r.success) {
        toast.error(r.error ?? (lang === "ar" ? "تعذّرت الإزالة" : "Couldn't remove"));
        return;
      }
      toast.success(lang === "ar" ? "تمت الإزالة" : "Placeholder removed");
      router.refresh();
    });
  }

  const tip = {
    parent: lang === "ar" ? "اسحب لإضافة طفل" : "Drag to link as parent",
    parentIn: lang === "ar" ? "اسحب لإضافة أب/أم" : "Drag here to link a parent",
    spouse: lang === "ar" ? "اسحب لإضافة زوج/ة" : "Drag to link as spouse",
  };

  if (person.is_placeholder) {
    return (
      <>
        <Handle type="target" position={Position.Top} id="top" style={PARENT_STYLE} title={tip.parentIn} />
        {/* A div + onClick so the remove button is not nested inside a link */}
        <div
          role={readOnly ? undefined : "link"}
          tabIndex={readOnly ? undefined : 0}
          aria-label={readOnly ? undefined : lang === "ar" ? "والد غير معروف: انقر لتعبئة الاسم" : "Unknown parent: click to fill in"}
          onClick={readOnly ? undefined : () => router.push(`/person/${person.slug ?? person.id}/edit`)}
          onKeyDown={readOnly ? undefined : (e) => e.key === "Enter" && router.push(`/person/${person.slug ?? person.id}/edit`)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ ...CARD_SIZE, opacity: dimmed ? DIM_OPACITY : 1, boxShadow: ring }}
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--background)] px-3 text-center transition-[opacity,border-color] duration-300",
            readOnly ? "cursor-default" : "cursor-pointer hover:border-[var(--primary)]/60",
            selected && "border-[var(--primary)]",
          )}
        >
          <PathMarker highlight={highlight} lang={lang} />
          {!readOnly && (
            <button
              type="button"
              tabIndex={deleteConfirm || hovered ? 0 : -1}
              onClick={handleDeletePlaceholder}
              onKeyDown={(e) => e.stopPropagation()}
              onBlur={() => setDeleteConfirm(false)}
              aria-label={deleteConfirm ? (lang === "ar" ? "تأكيد الحذف" : "Confirm removal") : lang === "ar" ? "إزالة" : "Remove placeholder"}
              title={deleteConfirm ? (lang === "ar" ? "تأكيد؟" : "Confirm?") : lang === "ar" ? "إزالة" : "Remove placeholder"}
              className={cn(
                "absolute -end-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-[background-color,color,opacity] duration-200",
                deleteConfirm
                  ? "border-[var(--destructive)] bg-[var(--destructive)] text-white opacity-100"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--destructive)] hover:text-white",
                !deleteConfirm && (hovered ? "opacity-100" : "pointer-events-none opacity-0"),
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[var(--border-strong)] text-xl text-[var(--muted-foreground)]" aria-hidden>
            ?
          </span>
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">
            {lang === "ar" ? "والد غير معروف" : "Unknown parent"}
          </span>
          {!readOnly && (
            <span className="text-xs text-[var(--muted-foreground)]">{lang === "ar" ? "انقر لتعبئة الاسم" : "Click to fill in"}</span>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} id="bottom" style={PARENT_STYLE} title={tip.parent} />
      </>
    );
  }

  const { given } = getNameParts(person, lang);
  const givenName = given || (lang === "ar" ? "بدون اسم" : "Unnamed");
  const fullName = getDisplayName(person, lang);
  const years = lifeYears(person.birth_date, person.death_date, lang);
  const tone = avatarTone(person.id);

  const shadow = ring
    ? ring
    : selected
      ? "0 0 0 2px var(--primary), 0 8px 24px rgba(36,21,23,0.12)"
      : isMe
        ? "0 0 0 2px var(--primary), 0 4px 14px rgba(36,21,23,0.08)"
        : hovered
          ? "0 8px 24px rgba(36,21,23,0.12)"
          : "0 4px 14px rgba(36,21,23,0.08)";

  return (
    <>
      {/* Top — incoming parent */}
      <Handle type="target" position={Position.Top} id="top" style={PARENT_STYLE} title={tip.parentIn} />

      {/* Left — spouse pair */}
      <Handle type="source" position={Position.Left} id="left" style={SPOUSE_STYLE} title={tip.spouse} />
      <Handle type="target" position={Position.Left} id="left-target" style={STACKED_TARGET_STYLE} />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: dimmed ? DIM_OPACITY : 1 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0.32, 1] }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...CARD_SIZE, boxShadow: shadow }}
        className={cn(
          "relative flex cursor-default flex-col items-center rounded-2xl border bg-[var(--card)] px-3 pb-3 pt-4 transition-[box-shadow,border-color] duration-200",
          selected || isMe ? "border-[var(--primary)]" : "border-[var(--border)]",
          readOnly && "justify-center pt-3",
        )}
      >
        <PathMarker highlight={highlight} lang={lang} />

        {isMe && !highlight && (
          <span className="absolute -top-2.5 end-3 z-20 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-foreground)]">
            {lang === "ar" ? "أنت" : "You"}
          </span>
        )}

        {/* Avatar: photo, or initials on a soft colour that is stable for this person */}
        <span
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold"
          style={{ background: tone.bg, color: tone.fg }}
          aria-hidden
        >
          {person.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- storage photo, rendered small on a transformed canvas
            <img src={person.photo_url} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            initialsOf(person, lang)
          )}
        </span>

        <p className="mt-2 w-full truncate text-center text-[15px] font-semibold leading-5 text-[var(--foreground)]" title={fullName}>
          {givenName}
        </p>
        <p className="h-4 w-full truncate text-center text-xs leading-4 text-[var(--muted-foreground)]">
          {years}
        </p>

        {/* Actions — hidden in read-only views */}
        {!readOnly && (
          <div className="mt-auto grid w-full grid-cols-2 gap-1.5">
            <Link
              href={`/person/${person.slug ?? person.id}`}
              onClick={(e) => e.stopPropagation()}
              className={pillClass}
              aria-label={lang === "ar" ? `عرض ملف ${fullName}` : `View ${fullName}'s profile`}
            >
              {lang === "ar" ? "عرض" : "View"}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onQuickAdd?.("child");
              }}
              className={pillClass}
              aria-label={lang === "ar" ? `إضافة طفل لـ ${fullName}` : `Add a child to ${fullName}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {lang === "ar" ? "طفل" : "Child"}
            </button>
          </div>
        )}

        {/* Add spouse — surfaces on hover */}
        {!readOnly && (
          <button
            type="button"
            tabIndex={hovered ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              data.onQuickAdd?.("spouse");
            }}
            className={cn(
              "absolute end-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm transition-[opacity,background-color,color] duration-200 hover:bg-[var(--highlight)] hover:text-[var(--highlight-foreground)]",
              hovered ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            title={lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
            aria-label={lang === "ar" ? `إضافة زوج/ة لـ ${fullName}` : `Add a spouse for ${fullName}`}
          >
            <Heart className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </motion.div>

      {/* Right — spouse pair */}
      <Handle type="source" position={Position.Right} id="right" style={SPOUSE_STYLE} title={tip.spouse} />
      <Handle type="target" position={Position.Right} id="right-target" style={STACKED_TARGET_STYLE} />

      {/* Bottom — outgoing parent */}
      <Handle type="source" position={Position.Bottom} id="bottom" style={PARENT_STYLE} title={tip.parent} />
    </>
  );
}
