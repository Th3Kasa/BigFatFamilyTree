"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

/** Move the item at `from` to `to` (both clamped), returning a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

type Drag = { id: string; order: string[]; dy: number };

/**
 * Vertical drag-to-reorder for a short list, with pointer events so it works
 * with a mouse, a pen and touch (HTML5 drag-and-drop does not work on phones).
 * Each row registers its element; the handle gets the pointer and arrow-key
 * handlers. The list re-orders live while dragging and `onCommit` runs once on
 * release when the order changed. Arrow Up/Down on the handle move one place.
 */
export function useDragReorder(ids: string[], onCommit: (next: string[], movedId: string) => void, onKeyMove: (id: string, delta: -1 | 1) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<(Drag & { startY: number; shift: number }) | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const rowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  };

  const end = (commit: boolean) => {
    const d = live.current;
    live.current = null;
    setDrag(null);
    if (commit && d && d.order.some((id, i) => id !== ids[i])) onCommit(d.order, d.id);
  };

  const handleProps = (id: string) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || ids.length < 2) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      live.current = { id, order: ids, dy: 0, startY: e.clientY, shift: 0 };
      setDrag({ id, order: ids, dy: 0 });
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = live.current;
      if (!d || d.id !== id) return;
      let order = d.order;
      const dy = e.clientY - d.startY - d.shift;
      const el = rows.current.get(id);
      const i = order.indexOf(id);
      if (el) {
        const centre = el.offsetTop + el.offsetHeight / 2 + dy;
        const next = rows.current.get(order[i + 1]);
        const prev = rows.current.get(order[i - 1]);
        // One swap per move: the next move measures the re-rendered rows.
        if (next && centre > next.offsetTop + next.offsetHeight / 2) {
          d.shift += next.offsetTop + next.offsetHeight - (el.offsetTop + el.offsetHeight);
          order = moveItem(order, i, i + 1);
        } else if (prev && centre < prev.offsetTop + prev.offsetHeight / 2) {
          d.shift += prev.offsetTop - el.offsetTop;
          order = moveItem(order, i, i - 1);
        }
      }
      d.order = order;
      d.dy = e.clientY - d.startY - d.shift;
      setDrag({ id, order, dy: d.dy });
    },
    onPointerUp() {
      if (live.current?.id === id) end(true);
    },
    onPointerCancel() {
      if (live.current?.id === id) end(false);
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (e.key === "Escape" && live.current) {
        e.preventDefault();
        end(false);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        onKeyMove(id, e.key === "ArrowUp" ? -1 : 1);
      }
    },
  });

  const rowStyle = (id: string): CSSProperties | undefined =>
    drag?.id === id ? { transform: `translateY(${drag.dy}px)`, position: "relative", zIndex: 10 } : undefined;

  return { order: drag?.order ?? ids, draggingId: drag?.id ?? null, rowRef, handleProps, rowStyle };
}
