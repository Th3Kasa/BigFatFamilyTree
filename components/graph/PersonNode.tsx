"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Eye, Plus, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  background: "oklch(0.62 0.20 18)",
  borderColor: "oklch(0.99 0 0)",
  boxShadow:
    "0 0 0 2px oklch(0.62 0.20 18 / 0.22), 0 2px 4px oklch(0.62 0.20 18 / 0.30)",
};

const PARENT_STYLE: React.CSSProperties = {
  ...HANDLE_BASE,
  background: "oklch(0.34 0.13 18)",
  borderColor: "oklch(0.99 0 0)",
  boxShadow:
    "0 0 0 2px oklch(0.34 0.13 18 / 0.22), 0 2px 4px oklch(0.34 0.13 18 / 0.30)",
};

const STACKED_TARGET_STYLE: React.CSSProperties = {
  ...HANDLE_BASE,
  background: "transparent",
  borderColor: "transparent",
  boxShadow: "none",
  opacity: 0,
};

export function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const { person, spouseId, lang } = data;
  const [hovered, setHovered] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function handleDeletePlaceholder(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleteConfirm(false);
    const r = await deletePersonCanvas(person.id);
    if (!r.success) {
      toast.error(r.error ?? "Couldn't remove");
      return;
    }
    toast.success(lang === "ar" ? "تمت الإزالة" : "Placeholder removed");
    startTransition(() => router.refresh());
  }

  const givenName =
    lang === "ar"
      ? (person.given_ar ?? person.given_en ?? "?")
      : (person.given_en ?? person.given_ar ?? "?");

  const familyName =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en ?? "")
      : (person.family_name_en ?? person.family_name_ar ?? "");

  const initials =
    givenName.charAt(0).toUpperCase() +
    (familyName.charAt(0) ?? "").toUpperCase();

  const tip = {
    parent: lang === "ar" ? "اسحب لإضافة طفل" : "Drag to link as parent",
    parentIn:
      lang === "ar" ? "اسحب لإضافة أب/أم" : "Drag here to link a parent",
    spouse: lang === "ar" ? "اسحب لإضافة زوج/ة" : "Drag to link as spouse",
  };

  if (person.is_placeholder) {
    return (
      <>
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          style={PARENT_STYLE}
          title={tip.parentIn}
        />
        {/* Use a div + onClick for navigation so the delete button is not nested inside an <a> */}
        <div
          role="link"
          tabIndex={0}
          onClick={() => router.push(`/person/${person.slug ?? person.id}/edit`)}
          onKeyDown={(e) => e.key === "Enter" && router.push(`/person/${person.slug ?? person.id}/edit`)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative flex w-[220px] h-[240px] cursor-pointer items-start justify-center pt-6"
        >
          <div
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--card)]/70 px-4 py-3 text-center transition-[transform,border-color,box-shadow] duration-300 ease-out",
              "shadow-[0_2px_10px_-4px_rgba(40,10,15,0.10)]",
              selected && "border-[var(--primary)]/60 shadow-[var(--shadow-glow)]",
              hovered && "-translate-y-px border-[var(--accent)]/70",
            )}
          >
            <button
              type="button"
              onClick={handleDeletePlaceholder}
              onBlur={() => setDeleteConfirm(false)}
              aria-label={deleteConfirm
                ? (lang === "ar" ? "تأكيد الحذف" : "Confirm removal")
                : (lang === "ar" ? "إزالة" : "Remove placeholder")}
              title={deleteConfirm
                ? (lang === "ar" ? "تأكيد؟" : "Confirm?")
                : (lang === "ar" ? "إزالة" : "Remove placeholder")}
              className={cn(
                "absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full",
                "border shadow-sm transition-[transform,background-color,color,opacity,border-color] duration-200",
                deleteConfirm
                  ? "border-[var(--destructive)] bg-[var(--destructive)] text-white opacity-100"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:-translate-y-px hover:bg-[var(--destructive)] hover:text-white",
                !deleteConfirm && (hovered ? "opacity-100" : "opacity-0 pointer-events-none"),
              )}
            >
              <X className="h-3 w-3" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--muted-foreground)]/50 bg-[var(--muted)]/40 text-[var(--muted-foreground)]">
              <span className="text-base">?</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                {lang === "ar" ? "والد غير معروف" : "Unknown parent"}
              </span>
              <span className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                {lang === "ar" ? "انقر لتعبئة الاسم" : "Click to fill in"}
              </span>
            </div>
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          style={PARENT_STYLE}
          title={tip.parent}
        />
      </>
    );
  }

  const isFemale = person.gender === "f";
  const isMale = person.gender === "m";

  const statusDot = isFemale
    ? "bg-rose-500"
    : isMale
      ? "bg-[var(--accent)]"
      : "bg-[var(--muted-foreground)]";

  const statusText =
    lang === "ar"
      ? isFemale
        ? "أنثى"
        : isMale
          ? "ذكر"
          : "—"
      : isFemale
        ? "Female"
        : isMale
          ? "Male"
          : "—";

  // Outer gradient ring around the portrait (uses padding + gradient bg)
  const portraitRingBg = isFemale
    ? "linear-gradient(135deg, oklch(0.78 0.16 12) 0%, oklch(0.62 0.20 18) 100%)"
    : isMale
      ? "linear-gradient(135deg, oklch(0.68 0.18 38) 0%, oklch(0.34 0.13 18) 100%)"
      : "linear-gradient(135deg, oklch(0.86 0.04 60) 0%, oklch(0.50 0.04 30) 100%)";

  return (
    <>
      {/* Top — incoming parent */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={PARENT_STYLE}
        title={tip.parentIn}
      />

      {/* Left — spouse pair */}
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={SPOUSE_STYLE}
        title={tip.spouse}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={STACKED_TARGET_STYLE}
      />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0.32, 1] }}
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Soft accent glow underneath (intensifies on hover/select) */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-4 -bottom-2 top-[90%] rounded-[28px] blur-2xl transition-opacity duration-300",
            isFemale
              ? "bg-rose-400/40 shadow-[0_30px_60px_-16px_rgba(244,63,94,0.45)]"
              : "bg-[oklch(0.68_0.18_38)]/40 shadow-[0_30px_60px_-16px_oklch(0.68_0.18_38_/_0.50)]",
            hovered || selected ? "opacity-100" : "opacity-60",
          )}
        />

        {/* Card */}
        <div
          className={cn(
            "relative z-10 w-[220px] h-[240px] overflow-hidden rounded-[24px] cursor-default",
            "glass-2 border border-[var(--border)]",
            "shadow-[var(--shadow-floating)] transition-[transform,box-shadow,border-color] duration-300 ease-out",
            "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px",
            "before:bg-gradient-to-r before:from-transparent before:via-[var(--accent)]/50 before:to-transparent",
            selected &&
              "border-[var(--primary)]/60 shadow-[var(--shadow-glow)] -translate-y-px",
            hovered && !selected && "-translate-y-[2px] shadow-[var(--shadow-deep)]",
          )}
        >
          {/* Top row — status + family caption */}
          <div className="flex items-center justify-between px-4 pt-3.5 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  statusDot,
                  (isFemale || isMale) && "animate-pulse",
                )}
              />
              <span className="select-none font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {statusText}
              </span>
            </div>
            {familyName && (
              <span className="max-w-[80px] truncate text-[9px] font-semibold uppercase tracking-[0.20em] text-[var(--muted-foreground)]">
                {familyName}
              </span>
            )}
          </div>

          {/* Portrait — square avatar with gradient ring */}
          <div className="mt-3 flex justify-center">
            <div
              className="rounded-[20px] p-[2.5px] shadow-[0_8px_20px_-8px_rgba(40,10,15,0.35)]"
              style={{ background: portraitRingBg }}
            >
              <Avatar className="h-[88px] w-[88px] rounded-[18px] ring-2 ring-[var(--card)]">
                {person.photo_url && (
                  <AvatarImage
                    src={person.photo_url}
                    alt={givenName}
                    className="object-cover"
                  />
                )}
                <AvatarFallback
                  className={cn(
                    "rounded-[18px] text-lg font-semibold",
                    isFemale
                      ? "bg-rose-50 text-rose-500"
                      : isMale
                        ? "bg-[oklch(0.97_0.03_60)] text-[var(--primary)]"
                        : "bg-[var(--muted)] text-[var(--foreground)]",
                  )}
                >
                  {initials || (isFemale ? "♀" : isMale ? "♂" : "?")}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Name */}
          <div className="mt-3 px-4 text-center">
            <h3
              className="truncate text-[17px] font-semibold leading-tight tracking-tight text-[var(--foreground)]"
              style={{
                fontFamily: "var(--font-display)",
                fontOpticalSizing: "auto",
              }}
              title={givenName}
            >
              {givenName}
            </h3>
          </div>

          {/* Action pills */}
          <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2">
            <Link
              href={`/person/${person.slug ?? person.id}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "group/btn flex h-9 items-center justify-center gap-1.5 rounded-2xl",
                "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
                "text-[11px] font-medium shadow-sm",
                "transition-[transform,background-color,color,box-shadow] duration-200",
                "hover:-translate-y-px hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] hover:shadow-[var(--shadow-floating)]",
              )}
              title={lang === "ar" ? "عرض" : "View"}
              aria-label={lang === "ar" ? "عرض" : "View"}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{lang === "ar" ? "عرض" : "View"}</span>
            </Link>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); data.onQuickAdd?.("child"); }}
              className={cn(
                "group/btn flex h-9 items-center justify-center gap-1.5 rounded-2xl",
                "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
                "text-[11px] font-medium shadow-sm",
                "transition-[transform,background-color,color,box-shadow] duration-200",
                "hover:-translate-y-px hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] hover:shadow-[var(--shadow-floating)]",
              )}
              title={lang === "ar" ? "إضافة طفل" : "Add child"}
              aria-label={lang === "ar" ? "إضافة طفل" : "Add child"}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lang === "ar" ? "طفل" : "Child"}</span>
            </button>
          </div>

          {/* Heart-pill (Add spouse) sits above the action row, surfaces on hover */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onQuickAdd?.("spouse"); }}
            className={cn(
              "absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full",
              "border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
              "shadow-sm transition-[opacity,transform,background-color,color] duration-200",
              "hover:bg-[var(--highlight)] hover:text-[var(--highlight-foreground)] hover:-translate-y-px",
              hovered ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            title={lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
            aria-label={lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
          >
            <Heart className="h-3.5 w-3.5" />
          </button>

          {/* Selected accent bar */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-6 bottom-[58px] h-[2px] rounded-full",
              "bg-gradient-to-r from-[var(--primary)] via-[var(--accent)] to-[var(--primary)]",
              "transition-opacity duration-300",
              selected ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </motion.div>

      {/* Right — spouse pair */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={SPOUSE_STYLE}
        title={tip.spouse}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        style={STACKED_TARGET_STYLE}
      />

      {/* Bottom — outgoing parent */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={PARENT_STYLE}
        title={tip.parent}
      />
    </>
  );
}
