"use client";

import { ReactFlow, Background, Controls, MiniMap, type NodeTypes, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function FamilyGraph({ nodes, edges }: Props) {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as { person?: { gender?: string; is_placeholder?: boolean } };
            if (d.person?.is_placeholder) return "#e5e7eb";
            return d.person?.gender === "f" ? "#fda4af" : "#93c5fd";
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
