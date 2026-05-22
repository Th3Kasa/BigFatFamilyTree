"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { Box, LayoutDashboard, Loader2 } from "lucide-react";
import { CanvasController } from "./CanvasController";
import { cn } from "@/lib/utils";
import type {
  GraphEdge,
  GraphNode,
  PersonInput,
  RelationshipInput,
} from "@/lib/graph/transform";

const FamilyTree3D = dynamic(
  () => import("./FamilyTree3D").then((m) => ({ default: m.FamilyTree3D })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center bg-[var(--background)]">
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading 3D…</span>
        </div>
      </div>
    ),
  },
);

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  relationships: RelationshipInput[];
  lang: "ar" | "en";
};

export function CanvasView(props: Props) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");

  return (
    <div className="relative h-full w-full">
      {/* View toggle — pinned top-center on the canvas */}
      <div className="glass-2 absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--border)] p-1 shadow-[var(--shadow-floating)]">
        <button
          type="button"
          onClick={() => setMode("2d")}
          aria-pressed={mode === "2d"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            mode === "2d"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          {props.lang === "ar" ? "ثنائي" : "2D"}
        </button>
        <button
          type="button"
          onClick={() => setMode("3d")}
          aria-pressed={mode === "3d"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            mode === "3d"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
        >
          <Box className="h-3.5 w-3.5" />
          {props.lang === "ar" ? "ثلاثي الأبعاد" : "3D"}
        </button>
      </div>

      {mode === "2d" ? (
        <CanvasController
          initialNodes={props.initialNodes}
          initialEdges={props.initialEdges}
          people={props.people}
          lang={props.lang}
        />
      ) : (
        <Suspense
          fallback={
            <div className="grid h-full w-full place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          }
        >
          <FamilyTree3D
            people={props.people}
            relationships={props.relationships}
            lang={props.lang}
          />
        </Suspense>
      )}
    </div>
  );
}
