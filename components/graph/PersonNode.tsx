"use client";

import { useState } from "react";
import Link from "next/link";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Eye, PlusCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PersonNodeData } from "@/lib/graph/transform";

type PersonNodeType = Node<PersonNodeData, "person">;

export function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const { person, spouseId, lang } = data;
  const [hovered, setHovered] = useState(false);

  const givenName =
    lang === "ar"
      ? (person.given_ar ?? person.given_en ?? "?")
      : (person.given_en ?? person.given_ar ?? "?");

  const familyName =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en ?? "")
      : (person.family_name_en ?? person.family_name_ar ?? "");

  const initials = givenName.charAt(0).toUpperCase() + (familyName.charAt(0) ?? "").toUpperCase();

  if (person.is_placeholder) {
    return (
      <>
        <Handle type="target" position={Position.Top} className="!border-border !bg-muted" />
        <div
          className={cn(
            "w-[220px] h-20 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)]/55",
            "flex items-center justify-center transition-[transform,border-color] duration-300 ease-out",
            selected && "border-[var(--primary)]/60",
            hovered && "-translate-y-px border-[var(--accent)]/60"
          )}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span className="text-xs text-muted-foreground font-medium">
            {lang === "ar" ? "إضافة معلومات ←" : "Add info →"}
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!border-border !bg-muted" />
      </>
    );
  }

  const avatarRingColor =
    person.gender === "f"
      ? "ring-rose-200"
      : person.gender === "m"
        ? "ring-sky-200"
        : "ring-border";

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !border-border !bg-background"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!w-2 !h-2 !border-border !bg-background"
      />
      <div
        className={cn(
          "relative w-[220px] h-20 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]",
          "flex items-center gap-3 px-3.5 cursor-default",
          "shadow-[var(--shadow-floating)] transition-[transform,box-shadow,border-color] duration-300 ease-out",
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[var(--accent)]/35 before:to-transparent",
          selected && "border-[var(--primary)]/60 shadow-[var(--shadow-glow)]",
          hovered && "-translate-y-px shadow-[var(--shadow-deep)]"
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Avatar */}
        <Avatar className={cn("h-10 w-10 shrink-0 ring-2", avatarRingColor)}>
          {person.photo_url && (
            <AvatarImage src={person.photo_url} alt={givenName} className="object-cover" />
          )}
          <AvatarFallback className="text-xs font-semibold bg-muted">
            {initials || (person.gender === "f" ? "♀" : "♂")}
          </AvatarFallback>
        </Avatar>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[14px] font-bold leading-tight truncate text-foreground"
            style={{ fontFamily: "var(--font-display, 'Fraunces Variable', serif)" }}
          >
            {givenName}
          </p>
          {familyName && (
            <p className="text-[12px] text-muted-foreground truncate leading-tight mt-0.5">
              {familyName}
            </p>
          )}
        </div>

        {/* Quick-action overlay on hover */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-end gap-1.5 px-2.5",
            "glass-2 rounded-2xl",
            "transition-opacity duration-200 ease-out",
            hovered ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <Link
            href={`/person/${person.slug ?? person.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-[transform,background-color,color] duration-200 hover:-translate-y-px hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
            title={lang === "ar" ? "عرض" : "View"}
          >
            <Eye className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={spouseId
              ? `/person/new?father=${person.gender !== "f" ? person.id : spouseId}&mother=${person.gender === "f" ? person.id : spouseId}`
              : `/person/new?${person.gender === "f" ? "mother" : "father"}=${person.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-[transform,background-color,color] duration-200 hover:-translate-y-px hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
            title={lang === "ar" ? "إضافة طفل" : "Add child"}
          >
            <PlusCircle className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={`/person/new?spouse=${person.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-[transform,background-color,color] duration-200 hover:-translate-y-px hover:bg-[var(--highlight)] hover:text-[var(--highlight-foreground)]"
            title={lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !border-border !bg-background"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="!w-2 !h-2 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-border !bg-background"
      />
    </>
  );
}
