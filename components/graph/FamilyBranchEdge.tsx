"use client";

import { useNodes, type EdgeProps } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 240;

type FamilyBranchData = {
  edgeKind: "family-branch";
  fatherId: string | null;
  motherId: string | null;
  childIds: string[];
};

export function FamilyBranchEdge({ data }: EdgeProps) {
  const nodes = useNodes();
  const { fatherId, motherId, childIds } = (data ?? {}) as FamilyBranchData;

  const fatherNode = fatherId ? nodes.find((n) => n.id === fatherId) : null;
  const motherNode = motherId ? nodes.find((n) => n.id === motherId) : null;

  // ── parent drop-start point ───────────────────────────────────
  let startX: number;
  let startY: number;

  if (fatherNode && motherNode) {
    const fx = fatherNode.position.x + NODE_WIDTH / 2;
    const mx = motherNode.position.x + NODE_WIDTH / 2;
    startX = (fx + mx) / 2;
    startY = Math.max(
      fatherNode.position.y + NODE_HEIGHT,
      motherNode.position.y + NODE_HEIGHT,
    );
  } else if (fatherNode) {
    startX = fatherNode.position.x + NODE_WIDTH / 2;
    startY = fatherNode.position.y + NODE_HEIGHT;
  } else if (motherNode) {
    startX = motherNode.position.x + NODE_WIDTH / 2;
    startY = motherNode.position.y + NODE_HEIGHT;
  } else {
    return null;
  }

  // ── child positions ───────────────────────────────────────────
  const childNodes = (childIds ?? [])
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is NonNullable<typeof n> => n != null);

  if (childNodes.length === 0) return null;

  const childCenterXs = childNodes.map((n) => n.position.x + NODE_WIDTH / 2);
  const childTopYs    = childNodes.map((n) => n.position.y);
  const minChildTopY  = Math.min(...childTopYs);

  // Junction Y sits halfway between parent bottom and nearest child top
  const gap       = minChildTopY - startY;
  const junctionY = startY + Math.max(gap * 0.5, 20);

  const minChildX = Math.min(...childCenterXs);
  const maxChildX = Math.max(...childCenterXs);

  // ── build SVG path ────────────────────────────────────────────
  // Each segment is a separate M…L so we get disconnected strokes
  const parts: string[] = [
    // Vertical drop from parent midpoint → junction
    `M ${startX} ${startY} L ${startX} ${junctionY}`,
  ];

  // Horizontal bar (only needed when >1 child)
  if (childNodes.length > 1) {
    const barLeft  = Math.min(startX, minChildX);
    const barRight = Math.max(startX, maxChildX);
    parts.push(`M ${barLeft} ${junctionY} L ${barRight} ${junctionY}`);
  }

  // Individual verticals from junction → each child top
  for (let i = 0; i < childCenterXs.length; i++) {
    parts.push(`M ${childCenterXs[i]} ${junctionY} L ${childCenterXs[i]} ${childTopYs[i]}`);
  }

  return (
    <path
      d={parts.join(" ")}
      stroke="oklch(0.38 0.06 18 / 0.55)"
      strokeWidth={1.5}
      fill="none"
      strokeLinejoin="round"
    />
  );
}
