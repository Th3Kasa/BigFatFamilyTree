"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { PersonNodeData } from "@/lib/graph/transform";

type PersonNodeType = Node<PersonNodeData, "person">;

export function PersonNode({ data }: NodeProps<PersonNodeType>) {
  const { person, lang } = data;

  const name =
    lang === "ar"
      ? (person.given_ar ?? person.given_en ?? "?")
      : (person.given_en ?? person.given_ar ?? "?");

  const family =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en ?? "")
      : (person.family_name_en ?? person.family_name_ar ?? "");

  if (person.is_placeholder) {
    return (
      <>
        <Handle type="target" position={Position.Top} />
        <div className="w-40 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
          <span className="text-gray-400 text-xs">Unknown</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </>
    );
  }

  const borderColor = person.gender === "f" ? "border-rose-300" : "border-sky-300";

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Link href={`/person/${person.id}`} className="block no-underline">
        <div
          className={`w-40 h-20 rounded-lg border-2 ${borderColor} bg-white shadow-sm hover:shadow-md hover:border-amber-400 transition-all p-2 flex flex-col items-center justify-center gap-1`}
        >
          {person.photo_url ? (
            <img
              src={person.photo_url}
              alt={name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <span className="text-base leading-none">
              {person.gender === "f" ? "👩" : "👨"}
            </span>
          )}
          <p className="text-xs font-semibold text-gray-800 truncate max-w-full text-center leading-tight">
            {name}
          </p>
          {family && (
            <p className="text-[10px] text-gray-400 truncate max-w-full text-center leading-tight">
              {family}
            </p>
          )}
        </div>
      </Link>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
