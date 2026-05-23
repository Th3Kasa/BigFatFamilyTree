"use client";

import { useEdges, useInternalNode, useStore, type EdgeProps } from "@xyflow/react";
import type { Edge } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 240;

type FamilyBranchData = {
  edgeKind: "family-branch";
  fatherId: string | null;
  motherId: string | null;
  childIds: string[];
};

// Structural lookup — no node positions involved.
function getSpouseId(parentId: string, edges: Edge[]): string | null {
  const spouseEdges = edges.filter(
    (e) =>
      (e.data as { edgeKind?: string } | undefined)?.edgeKind === "spouse" &&
      (e.source === parentId || e.target === parentId),
  );
  const preferred =
    spouseEdges.find(
      (e) => (e.data as { status?: string } | undefined)?.status === "current",
    ) ?? spouseEdges[0];
  if (!preferred) return null;
  return preferred.source === parentId ? preferred.target : preferred.source;
}

function posEq(
  a: Record<string, { x: number; y: number }>,
  b: Record<string, { x: number; y: number }>,
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const id of ak) {
    if (a[id].x !== b[id]?.x || a[id].y !== b[id]?.y) return false;
  }
  return true;
}

export function FamilyBranchEdge({ data, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  // useEdges is structural (relationship graph), not position-sensitive.
  // It only re-renders this component when edges are added/removed, not on drag.
  const edges = useEdges();
  const { fatherId = null, motherId = null, childIds = [] } = (data ?? {}) as Partial<FamilyBranchData>;

  // Derive spouse IDs structurally before calling hooks.
  const fatherSpouseId = fatherId ? getSpouseId(fatherId, edges) : null;
  const motherSpouseId = motherId ? getSpouseId(motherId, edges) : null;

  // Subscribe to exactly 4 individual node positions.
  // Each useInternalNode re-renders only when THAT specific node moves,
  // rather than the entire node array (which is what useNodes() would do).
  const fatherNode = useInternalNode(fatherId ?? "");
  const motherNode = useInternalNode(motherId ?? "");
  const fatherSpouseNode = useInternalNode(fatherSpouseId ?? "");
  const motherSpouseNode = useInternalNode(motherSpouseId ?? "");

  // For sibling children (beyond childIds[0] which uses lag-free EdgeProps),
  // subscribe to only those specific positions via a narrow store selector.
  const siblingChildIds = childIds.slice(1);
  const siblingPositions = useStore(
    (s) => {
      const map: Record<string, { x: number; y: number }> = {};
      for (const node of s.nodes) {
        if (siblingChildIds.includes(node.id)) {
          map[node.id] = node.position;
        }
      }
      return map;
    },
    posEq,
  );

  // ── source parent (lag-free via EdgeProps) ───────────────────
  const srcCentreX = sourceX;
  const srcMidY    = sourceY - NODE_HEIGHT / 2;
  const MID_Y      = NODE_HEIGHT / 2;

  // ── marriage-line start point ─────────────────────────────────
  let startX: number;
  let startY: number;

  if (fatherNode && motherNode) {
    startX = (srcCentreX + motherNode.position.x + NODE_WIDTH / 2) / 2;
    startY = Math.max(srcMidY, motherNode.position.y + MID_Y);
  } else if (fatherNode) {
    const spouse = fatherSpouseNode;
    if (spouse) {
      startX = (srcCentreX + spouse.position.x + NODE_WIDTH / 2) / 2;
      startY = Math.max(srcMidY, spouse.position.y + MID_Y);
    } else {
      startX = srcCentreX;
      startY = sourceY;
    }
  } else if (motherNode) {
    const spouse = motherSpouseNode;
    if (spouse) {
      startX = (srcCentreX + spouse.position.x + NODE_WIDTH / 2) / 2;
      startY = Math.max(srcMidY, spouse.position.y + MID_Y);
    } else {
      startX = srcCentreX;
      startY = sourceY;
    }
  } else {
    return null;
  }

  // ── child positions ───────────────────────────────────────────
  const targetChildId = childIds[0];
  const childCenterXs: number[] = [];
  const childTopYs: number[] = [];

  for (const id of childIds) {
    if (id === targetChildId) {
      childCenterXs.push(targetX);
      childTopYs.push(targetY);
    } else {
      const pos = siblingPositions[id];
      if (pos) {
        childCenterXs.push(pos.x + NODE_WIDTH / 2);
        childTopYs.push(pos.y);
      }
    }
  }

  if (childCenterXs.length === 0) return null;

  const minChildTopY = Math.min(...childTopYs);
  const gap          = minChildTopY - startY;
  // Clamp junctionY so it never overshoots the topmost child. Without this,
  // dragging a child close to its parent makes junctionY exceed minChildTopY,
  // causing the drop line to render upward through the parent node.
  const junctionY = gap > 0
    ? Math.min(startY + Math.max(gap * 0.5, 20), minChildTopY - 2)
    : (startY + minChildTopY) / 2;
  const minChildX    = Math.min(...childCenterXs);
  const maxChildX    = Math.max(...childCenterXs);

  // ── build SVG path ────────────────────────────────────────────
  const parts: string[] = [
    `M ${startX} ${startY} L ${startX} ${junctionY}`,
  ];

  if (childCenterXs.length > 1) {
    const barLeft  = Math.min(startX, minChildX);
    const barRight = Math.max(startX, maxChildX);
    parts.push(`M ${barLeft} ${junctionY} L ${barRight} ${junctionY}`);
  }

  for (let i = 0; i < childCenterXs.length; i++) {
    parts.push(`M ${childCenterXs[i]} ${junctionY} L ${childCenterXs[i]} ${childTopYs[i]}`);
  }

  return (
    <path
      d={parts.join(" ")}
      style={{ stroke: "oklch(0.62 0.20 18 / 0.70)", strokeWidth: 2, fill: "none" }}
      strokeLinejoin="round"
    />
  );
}
