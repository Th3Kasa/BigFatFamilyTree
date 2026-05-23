"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContextMenuTarget =
  | { kind: "node"; personId: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number };

type Props = {
  target: ContextMenuTarget;
  lang: "ar" | "en";
  personName?: string;
  onClose: () => void;
  onAddChild: () => void;
  onAddSpouse: () => void;
  onAddParent: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddPerson: () => void;
  deleteConfirm?: boolean;
};

export function NodeContextMenu({
  target, lang, personName,
  onClose,
  onAddChild, onAddSpouse, onAddParent, onEdit, onDelete, onAddPerson,
  deleteConfirm = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - 8;
    const maxTop = window.innerHeight - height - 8;
    // In RTL (Arabic) open leftward from the click point so the menu doesn't
    // overlap the cursor origin text. Fall back toward the right edge if needed.
    const rawLeft = lang === "ar"
      ? Math.max(8, target.x - width)
      : Math.min(Math.max(8, target.x), maxLeft);
    setPos({
      left: Math.min(rawLeft, maxLeft),
      top: Math.min(Math.max(8, target.y), maxTop),
    });
  }, [target.x, target.y, lang]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item =
    "block w-full text-start px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors";
  const dangerItem =
    "block w-full text-start px-3 py-2 text-sm text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors";

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[180px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label={
        target.kind === "node" && personName
          ? (lang === "ar" ? `إجراءات لـ ${personName}` : `Actions for ${personName}`)
          : (lang === "ar" ? "إجراءات اللوحة" : "Canvas actions")
      }
    >
      {target.kind === "node" ? (
        <>
          <button type="button" role="menuitem" autoFocus onClick={onAddChild} className={item}>
            {lang === "ar" ? "إضافة ابن/ابنة" : "Add child"}
          </button>
          <button type="button" role="menuitem" onClick={onAddSpouse} className={item}>
            {lang === "ar" ? "إضافة زوج/زوجة" : "Add spouse"}
          </button>
          <button type="button" role="menuitem" onClick={onAddParent} className={item}>
            {lang === "ar" ? "إضافة والد/والدة" : "Add parent"}
          </button>
          <hr className="border-[var(--border)]" />
          <button type="button" role="menuitem" onClick={onEdit} className={item}>
            {lang === "ar" ? "تعديل" : "Edit"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onDelete}
            className={
              deleteConfirm
                ? "block w-full text-start px-3 py-2 text-sm text-white bg-[var(--destructive)] transition-colors"
                : dangerItem
            }
          >
            {deleteConfirm
              ? (lang === "ar" ? "تأكيد؟" : "Confirm?")
              : (lang === "ar" ? "حذف" : "Delete")}
          </button>
        </>
      ) : (
        <button type="button" role="menuitem" autoFocus onClick={onAddPerson} className={item}>
          {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
        </button>
      )}
    </div>
  );
}
