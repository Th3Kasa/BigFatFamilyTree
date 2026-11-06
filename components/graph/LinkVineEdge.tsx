"use client";

import { useMemo } from "react";
import type { EdgeProps } from "@xyflow/react";
import { linkVine } from "@/lib/graph/vines";

/**
 * Adoption and guardian links: a single wandering line, dashed in the link's own
 * colour. The look (and the finder's highlight) comes in through `style`, set in
 * transform.ts and highlight.ts.
 */
export function LinkVineEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const d = useMemo(
    () => linkVine({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, id),
    [id, sourceX, sourceY, targetX, targetY],
  );
  return <path d={d} style={{ fill: "none", pointerEvents: "none", ...style }} strokeLinecap="round" />;
}
