"use client";

import { useInternalNode, useStore, type EdgeProps } from "@xyflow/react";
import { EDGE_STYLES } from "@/lib/graph/edge-styles";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 240;

type FamilyBranchData = {
  edgeKind: "family-branch";
  fatherId: string | null;
  motherId: string | null;
  childIds: string[];
};

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
  const { fatherId = null, motherId = null, childIds = [] } = (data ?? {}) as Partial<FamilyBranchData>;

  // Subscribe to the two recorded-parent positions individually.
  // Each useInternalNode re-renders only when THAT specific node moves,
  // rather than the entire node array (which is what useNodes() would do).
  const fatherNode = useInternalNode(fatherId ?? "");
  const motherNode = useInternalNode(motherId ?? "");

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
  } else if (fatherNode || motherNode) {
    // Only one parent is RECORDED. Hang the line from that parent's own
    // handle — never from the midpoint with their current spouse, which
    // would falsely imply the spouse is the other parent.
    startX = srcCentreX;
    startY = sourceY;
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
      style={{ stroke: EDGE_STYLES.parentChild.stroke, strokeWidth: 2, fill: "none" }}
      strokeLinejoin="round"
    />
  );
}
