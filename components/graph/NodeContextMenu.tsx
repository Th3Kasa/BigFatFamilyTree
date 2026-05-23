"use client";

import { useEffect, useRef } from "react";

export type ContextMenuTarget =
  | { kind: "node"; personId: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number };

type Props = {
  target: ContextMenuTarget;
  lang: "ar" | "en";
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
  target, lang, onClose,
  onAddChild, onAddSpouse, onAddParent, onEdit, onDelete, onAddPerson,
  deleteConfirm = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

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
      style={{ left: target.x, top: target.y }}
      role="menu"
    >
      {target.kind === "node" ? (
        <>
          <button type="button" onClick={onAddChild} className={item}>
            {lang === "ar" ? "إضافة ابن/ابنة" : "Add child"}
          </button>
          <button type="button" onClick={onAddSpouse} className={item}>
            {lang === "ar" ? "إضافة زوج/زوجة" : "Add spouse"}
          </button>
          <button type="button" onClick={onAddParent} className={item}>
            {lang === "ar" ? "إضافة والد/والدة" : "Add parent"}
          </button>
          <hr className="border-[var(--border)]" />
          <button type="button" onClick={onEdit} className={item}>
            {lang === "ar" ? "تعديل" : "Edit"}
          </button>
          <button
            type="button"
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
        <button type="button" onClick={onAddPerson} className={item}>
          {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
        </button>
      )}
    </div>
  );
}
