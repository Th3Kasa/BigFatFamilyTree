"use client";

import { CanvasController } from "./CanvasController";
import type { GraphEdge, GraphNode, PersonInput } from "@/lib/graph/transform";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
  /** Guest (signed-out) view: explore the tree but no editing or details. */
  readOnly?: boolean;
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
      />
    </div>
  );
}
