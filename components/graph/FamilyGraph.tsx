"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnNodesChange,
  type OnEdgesChange,
  type OnMoveStart,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import { FamilyBranchEdge } from "./FamilyBranchEdge";
import { SpouseEdge } from "./SpouseEdge";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode, personRef: PersonNode };
const edgeTypes: EdgeTypes = {
  "family-branch": FamilyBranchEdge,
  spouse: SpouseEdge,
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onNodeDragStop?: OnNodeDrag;
  onNodeClick?: NodeMouseHandler;
  onPaneClick?: () => void;
  onMoveStart?: OnMoveStart;
  panOnDrag?: boolean | number[];
  selectionMode?: boolean;
  nodesDraggable?: boolean;
  /** Extra layers inside the flow (e.g. generation labels). */
  children?: React.ReactNode;
};

/**
 * The React Flow surface. People are linked through the family panel, never by
 * dragging lines, so connecting is off and the handles are invisible anchors.
 * Each card renders its own button, so the node wrappers are not tab stops.
 */
export function FamilyGraph({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onNodeClick,
  onPaneClick,
  onMoveStart,
  panOnDrag = [1, 2],
  selectionMode = false,
  nodesDraggable = false,
  children,
}: Props) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges as Edge[]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={2.5}
        nodesDraggable={nodesDraggable}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveStart={onMoveStart}
        panOnDrag={panOnDrag}
        selectionOnDrag={selectionMode}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.2} color="#E7DCD8" variant={BackgroundVariant.Dots} />
        {children}
      </ReactFlow>
    </div>
  );
}
