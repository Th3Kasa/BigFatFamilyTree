// Single source of truth for canvas edge colors and dash patterns.
// Consumed by SpouseEdge, FamilyBranchEdge, transform.ts (adopted/guardian
// edge styles) AND the CanvasOverlay legend — so the legend can never drift
// from what is actually drawn.

export const EDGE_STYLES = {
  /** Marriage bar — current couple. */
  coupleCurrent: { stroke: "oklch(0.62 0.20 18 / 0.70)", dash: undefined },
  /** Marriage bar — divorced. */
  coupleDivorced: { stroke: "oklch(0.62 0.20 18 / 0.55)", dash: "6 5" },
  /** Marriage bar — widowed (also marked with a dagger glyph). */
  coupleWidowed: { stroke: "oklch(0.48 0.03 25 / 0.60)", dash: "2 4" },
  /** Parent-child descent lines (family branch T-junction). */
  parentChild: { stroke: "oklch(0.55 0.10 200 / 0.75)", dash: undefined },
  /** Adoptive parent link. */
  adopted: { stroke: "oklch(0.52 0.18 280 / 0.65)", dash: "7 4" },
  /** Guardian / raised-by link. */
  guardian: { stroke: "oklch(0.52 0.14 150 / 0.65)", dash: "3 3" },
} as const;

/** Opacity applied to past marriages of a remarried person. */
export const GHOST_OPACITY = 0.45;

export const WIDOWED_GLYPH = "†";
