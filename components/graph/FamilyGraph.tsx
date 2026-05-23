"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnNodeDrag,
  type OnEdgesDelete,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import { FamilyBranchEdge } from "./FamilyBranchEdge";
import { SpouseEdge } from "./SpouseEdge";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode };
const edgeTypes: EdgeTypes = {
  "family-branch": FamilyBranchEdge,
  "spouse": SpouseEdge,
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onNodeDragStop?: OnNodeDrag;
  onConnect?: (c: Connection) => void;
  onNodeContextMenu?: NodeMouseHandler;
  onEdgeContextMenu?: EdgeMouseHandler;
  onPaneContextMenu?: (e: React.MouseEvent | MouseEvent) => void;
  onNodeClick?: NodeMouseHandler;
  onEdgeClick?: EdgeMouseHandler;
  onPaneClick?: () => void;
  onEdgesDelete?: OnEdgesDelete;
  panOnDrag?: boolean | number[];
  selectionMode?: boolean;
};

export function FamilyGraph({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onConnect,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onEdgesDelete,
  panOnDrag = [1, 2],
  selectionMode = true,
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

        minZoom={0.1}
        maxZoom={2.5}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onEdgesDelete={onEdgesDelete}
        panOnDrag={panOnDrag}
        selectionOnDrag={selectionMode}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "oklch(0.38 0.06 18 / 0.45)", strokeWidth: 1.5 },
          animated: false,
        }}
      >
        <Background
          gap={24}
          size={1}
          color="#e5e7eb"
          variant={BackgroundVariant.Dots}
        />
      </ReactFlow>
    </div>
  );
}
