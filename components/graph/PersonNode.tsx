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
  const { person, lang } = data;
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
            "w-[220px] h-20 rounded-xl border-2 border-dashed border-border bg-muted/50",
            "flex items-center justify-center transition-all duration-200",
            selected && "ring-2 ring-primary ring-offset-1",
            hovered && "scale-[1.02] border-primary/40"
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
      <div
        className={cn(
          "w-[220px] h-20 rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(20_20_20/0.06),0_4px_12px_rgb(20_20_20/0.08)]",
          "flex items-center gap-3 px-3 transition-all duration-200 cursor-default relative overflow-hidden",
          selected && "ring-2 ring-primary ring-offset-1 shadow-[0_1px_2px_rgb(20_20_20/0.06),0_8px_24px_rgb(20_20_20/0.12)]",
          hovered && "scale-[1.02] shadow-[0_1px_2px_rgb(20_20_20/0.06),0_8px_24px_rgb(20_20_20/0.12)]"
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
            "absolute inset-0 flex items-center justify-end gap-1 px-2",
            "bg-card/90 backdrop-blur-sm rounded-xl",
            "transition-opacity duration-150",
            hovered ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <Link
            href={`/person/${person.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-background border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
            title={lang === "ar" ? "عرض" : "View"}
          >
            <Eye className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/person/new?${person.gender === "f" ? "mother" : "father"}=${person.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-background border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
            title={lang === "ar" ? "إضافة طفل" : "Add child"}
          >
            <PlusCircle className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/person/new?spouse=${person.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-background border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
            title={lang === "ar" ? "إضافة زوج/ة" : "Add spouse"}
          >
            <UserPlus className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-border !bg-background"
      />
    </>
  );
}
