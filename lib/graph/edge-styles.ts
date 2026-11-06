// Single source of truth for canvas edge colors and dash patterns.
// Consumed by SpouseEdge, FamilyBranchEdge, transform.ts (adopted/guardian
// edge styles), the printed PDF AND the CanvasOverlay legend — so the legend
// can never drift from what is actually drawn.

import { BARK } from "./vines";

// Every stroke is at least 3:1 against the white canvas (WCAG 1.4.11).
export const EDGE_STYLES = {
  /** Marriage vine — current couple (two strands twined together). */
  coupleCurrent: { stroke: BARK, dash: undefined },
  /** Marriage line — divorced. */
  coupleDivorced: { stroke: "#A0536A", dash: "6 5" },
  /** Marriage line — widowed (also marked with a dagger glyph). */
  coupleWidowed: { stroke: "#857476", dash: "2 4" },
  /** Parent-child vine (trunk, limbs and twigs). */
  parentChild: { stroke: BARK, dash: undefined },
  /** Adoptive parent link. */
  adopted: { stroke: "#6D4FA3", dash: "7 4" },
  /** Guardian / raised-by link. */
  guardian: { stroke: "#3F7A3A", dash: "3 3" },
} as const;

/** Opacity applied to past marriages of a remarried person. */
export const GHOST_OPACITY = 0.45;

export const WIDOWED_GLYPH = "†";
