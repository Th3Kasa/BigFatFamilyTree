"use client";

import { useNodes, useEdges, type EdgeProps } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 240;

type FamilyBranchData = {
  edgeKind: "family-branch";
  fatherId: string | null;
  motherId: string | null;
  childIds: string[];
};

export function FamilyBranchEdge({ data, sourceX, sourceY }: EdgeProps) {
  const nodes = useNodes();
  const edges = useEdges();
  const { fatherId, motherId, childIds } = (data ?? {}) as FamilyBranchData;

  // sourceX/sourceY from EdgeProps are updated every drag frame by React Flow
  // (they represent the bottom handle of the source parent).
  // Derive source parent's card-centre X and marriage-line Y from them directly
  // so the primary parent's position is always lag-free.
  // sourceX = node centre X (bottom handle is horizontally centred)
  // sourceY = node bottom Y  →  midY = sourceY - MID_Y
  const srcCentreX = sourceX;
  const srcMidY    = sourceY - NODE_HEIGHT / 2;

  const fatherNode = fatherId ? nodes.find((n) => n.id === fatherId) : null;
  const motherNode = motherId ? nodes.find((n) => n.id === motherId) : null;

  // When only one parent is known in the family group, look for that parent's
  // spouse edge on the canvas and use the marriage midpoint as the drop origin.
  // Prefers current-status spouse; falls back to any spouse.
  function findSpouseNode(parentId: string) {
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
    const spouseId =
      preferred.source === parentId ? preferred.target : preferred.source;
    return nodes.find((n) => n.id === spouseId) ?? null;
  }

  // ── parent drop-start point ───────────────────────────────────
  let startX: number;
  let startY: number;

  // Marriage-line Y: left/right handles are at mid-height of the card.
  // The vertical drop must originate from the centre of the marriage line
  // (matching the reference diagram), not from below the cards.
  const MID_Y = NODE_HEIGHT / 2;

  if (fatherNode && motherNode) {
    // Both parents explicit — midpoint of their marriage line.
    // Use srcCentreX/srcMidY for the source (father) for lag-free drag;
    // fall back to useNodes() for the other parent.
    startX = (srcCentreX + motherNode.position.x + NODE_WIDTH / 2) / 2;
    startY = Math.max(srcMidY, motherNode.position.y + MID_Y);
  } else if (fatherNode) {
    // Only father in the data — look for a spouse on canvas
    const spouse = findSpouseNode(fatherId!);
    if (spouse) {
      startX = (srcCentreX + spouse.position.x + NODE_WIDTH / 2) / 2;
      startY = Math.max(srcMidY, spouse.position.y + MID_Y);
    } else {
      startX = srcCentreX;
      startY = sourceY; // bottom handle, no spouse
    }
  } else if (motherNode) {
    // Only mother in the data — look for a spouse on canvas
    const spouse = findSpouseNode(motherId!);
    if (spouse) {
      startX = (srcCentreX + spouse.position.x + NODE_WIDTH / 2) / 2;
      startY = Math.max(srcMidY, spouse.position.y + MID_Y);
    } else {
      startX = srcCentreX;
      startY = sourceY; // bottom handle, no spouse
    }
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
      style={{ stroke: "oklch(0.62 0.20 18 / 0.70)", strokeWidth: 2, fill: "none" }}
      strokeLinejoin="round"
    />
  );
}
