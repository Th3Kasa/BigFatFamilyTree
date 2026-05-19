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
};

export function NodeContextMenu({
  target, lang, onClose,
  onAddChild, onAddSpouse, onAddParent, onEdit, onDelete, onAddPerson,
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

  const item = "block w-full text-start px-3 py-2 text-sm hover:bg-amber-50 transition-colors";
  const danger = "block w-full text-start px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors";

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ left: target.x, top: target.y }}
      role="menu"
    >
      {target.kind === "node" ? (
        <>
          <button onClick={onAddChild} className={item}>
            {lang === "ar" ? "إضافة ابن/ابنة" : "Add child"}
          </button>
          <button onClick={onAddSpouse} className={item}>
            {lang === "ar" ? "إضافة زوج/زوجة" : "Add spouse"}
          </button>
          <button onClick={onAddParent} className={item}>
            {lang === "ar" ? "إضافة والد/والدة" : "Add parent"}
          </button>
          <hr className="border-gray-100" />
          <button onClick={onEdit} className={item}>
            {lang === "ar" ? "تعديل" : "Edit"}
          </button>
          <button onClick={onDelete} className={danger}>
            {lang === "ar" ? "حذف" : "Delete"}
          </button>
        </>
      ) : (
        <button onClick={onAddPerson} className={item}>
          {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
        </button>
      )}
    </div>
  );
}
