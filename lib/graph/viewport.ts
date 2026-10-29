/**
 * Where the canvas should look when it opens (or when asked to re-frame).
 * The default is the whole tree, fit to the screen; explicit intents win:
 * a relationship path, then a `?focus=` jump, then an explicit "Center on me".
 * Pure: unit tested in viewport.test.ts.
 */

export type ViewportIntent =
  | { kind: "fit-all" }
  | { kind: "path"; ids: string[] }
  | { kind: "node"; id: string; reason: "focus" | "me" };

export function resolveViewportIntent(input: {
  nodeIds: Iterable<string>;
  /** People on the highlighted relationship path. */
  pathIds?: string[] | null;
  /** `/?focus=<id>`. */
  focusId?: string | null;
  /** Set only when the user pressed "Center on me". */
  centerOnMeId?: string | null;
}): ViewportIntent {
  const ids = new Set(input.nodeIds);
  const path = (input.pathIds ?? []).filter((id) => ids.has(id));
  if (path.length > 0) return { kind: "path", ids: path };
  if (input.focusId && ids.has(input.focusId)) return { kind: "node", id: input.focusId, reason: "focus" };
  if (input.centerOnMeId && ids.has(input.centerOnMeId)) return { kind: "node", id: input.centerOnMeId, reason: "me" };
  return { kind: "fit-all" };
}

/** Padding used for every "show the whole tree" fit (first load, Full tree, Fit, after Tidy up). */
export const FIT_ALL = { padding: 0.15, minZoom: 0.05, maxZoom: 1 } as const;

/** Below this zoom, cards switch to a compact, larger-text rendering. */
export const COMPACT_ZOOM = 0.5;
