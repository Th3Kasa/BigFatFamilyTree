"use client";

import { useEffect } from "react";

/**
 * While the tree is on screen, a pinch or double-tap zooms the tree, never
 * the whole page. On phones a pinch that started on the header or the
 * generation buttons used to zoom the page; every later swipe then moved the
 * tree instead of the page, so people were stuck zoomed in with the menu bar
 * off screen. The tree has its own zoom (pinch on it, or + / − / Fit).
 */
export function useNoPageZoom() {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.touchAction;
    root.style.touchAction = "pan-x pan-y";
    return () => {
      root.style.touchAction = before;
    };
  }, []);
}
