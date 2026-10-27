"use client";

import { CanvasController } from "./CanvasController";
import type { GraphEdge, GraphNode, PersonInput } from "@/lib/graph/transform";
import type { PathHighlight } from "@/lib/graph/highlight";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
  /** Read-only view: explore the tree but no editing or details drawer. */
  readOnly?: boolean;
  /** Signed-out visitor (defaults to `readOnly`). False for a signed-in read-only view. */
  guest?: boolean;
  /** Relationship path to light up; everyone else fades back. */
  highlight?: PathHighlight | null;
};

export function CanvasView(props: Props) {
  return (
    <div className="relative h-full w-full">
      <CanvasController
        initialNodes={props.initialNodes}
        initialEdges={props.initialEdges}
        people={props.people}
        lang={props.lang}
        readOnly={props.readOnly}
        guest={props.guest}
        highlight={props.highlight}
      />
    </div>
  );
}
