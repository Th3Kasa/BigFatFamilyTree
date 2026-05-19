"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  type NodeTypes,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeDragStop?: OnNodeDrag;
  onConnect?: (c: Connection) => void;
  onNodeContextMenu?: NodeMouseHandler;
  onPaneContextMenu?: (e: React.MouseEvent | MouseEvent) => void;
  onNodeClick?: NodeMouseHandler;
  onPaneClick?: () => void;
  panOnDrag?: boolean | number[];
  selectionMode?: boolean;
};

export function FamilyGraph({
  nodes,
  edges,
  onNodeDragStop,
  onConnect,
  onNodeContextMenu,
  onPaneContextMenu,
  onNodeClick,
  onPaneClick,
  panOnDrag = [1, 2],
  selectionMode = true,
}: Props) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        panOnDrag={panOnDrag}
        selectionOnDrag={selectionMode}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "#d1d5db", strokeWidth: 1.5 },
          animated: false,
        }}
      >
        <Background
          gap={24}
          size={1}
          color="#e5e7eb"
          variant={BackgroundVariant.Dots}
        />

        <MiniMap
          className="!rounded-xl !overflow-hidden !shadow-lg !border !border-border"
          nodeColor={(n) => {
            const d = n.data as { person?: { gender?: string; is_placeholder?: boolean } };
            if (d.person?.is_placeholder) return "#e5e7eb";
            return d.person?.gender === "f" ? "#fda4af" : "#93c5fd";
          }}
          maskColor="rgb(249 250 251 / 0.7)"
          style={{ bottom: 80, right: 16 }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
