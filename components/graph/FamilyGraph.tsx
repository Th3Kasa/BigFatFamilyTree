"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnEdgesDelete,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onNodeDragStop?: OnNodeDrag;
  onConnect?: (c: Connection) => void;
  onNodeContextMenu?: NodeMouseHandler;
  onPaneContextMenu?: (e: React.MouseEvent | MouseEvent) => void;
  onNodeClick?: NodeMouseHandler;
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
  onPaneContextMenu,
  onNodeClick,
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

        minZoom={0.1}
        maxZoom={2.5}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgesDelete={onEdgesDelete}
        panOnDrag={panOnDrag}
        selectionOnDrag={selectionMode}
        deleteKeyCode="Delete"
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
      </ReactFlow>
    </div>
  );
}
