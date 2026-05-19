"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Connection, NodeMouseHandler, OnNodeDrag } from "@xyflow/react";
import { FamilyGraph } from "./FamilyGraph";
import { NodeContextMenu, type ContextMenuTarget } from "./NodeContextMenu";
import { QuickAddDialog, type QuickAddRelation } from "./QuickAddDialog";
import { updateNodePosition, autoLayoutAll } from "@/lib/actions/canvas";
import { createRelationship } from "@/lib/actions/relationships";
import { deletePerson } from "@/lib/actions/people";
import type { GraphNode, GraphEdge, PersonInput } from "@/lib/graph/transform";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
};

export function CanvasController({ initialNodes, initialEdges, people, lang }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [menu, setMenu] = useState<ContextMenuTarget | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddRelation | null>(null);

  const onNodeDragStop: OnNodeDrag = (_, node) => {
    startTransition(async () => {
      await updateNodePosition(node.id, node.position.x, node.position.y);
    });
  };

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const fd = new FormData();
    fd.set("other_person_id", c.target);
    fd.set("type", "spouse");
    fd.set("status", "current");
    startTransition(async () => {
      await createRelationship(c.source!, null, fd);
      router.refresh();
    });
  };

  const onNodeContextMenu: NodeMouseHandler = (e, node) => {
    e.preventDefault();
    setMenu({ kind: "node", personId: node.id, x: e.clientX, y: e.clientY });
  };

  const onPaneContextMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setMenu({ kind: "pane", x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
  };

  function personById(id: string) {
    return people.find((p) => p.id === id);
  }

  function handleEdit() {
    if (menu?.kind !== "node") return;
    router.push(`/person/${menu.personId}/edit`);
  }

  function handleDelete() {
    if (menu?.kind !== "node") return;
    const confirmed = window.confirm(lang === "ar" ? "حذف هذا الشخص؟" : "Delete this person?");
    if (!confirmed) return;
    const id = menu.personId;
    setMenu(null);
    startTransition(async () => {
      await deletePerson(id);
      router.refresh();
    });
  }

  function handleAddChild() {
    if (menu?.kind !== "node") return;
    const parent = personById(menu.personId);
    if (!parent) return;
    setMenu(null);
    setQuickAdd({ kind: "child", parentId: parent.id, parentGender: parent.gender });
  }
  function handleAddSpouse() {
    if (menu?.kind !== "node") return;
    setMenu(null);
    setQuickAdd({ kind: "spouse", otherId: menu.personId });
  }
  function handleAddParent() {
    if (menu?.kind !== "node") return;
    setMenu(null);
    setQuickAdd({ kind: "parent", childId: menu.personId, parentGender: "unknown" });
  }
  function handleAddStandalone() {
    setMenu(null);
    setQuickAdd({ kind: "standalone" });
  }

  function handleAutoLayout() {
    startTransition(async () => {
      await autoLayoutAll();
      router.refresh();
    });
  }

  return (
    <>
      <FamilyGraph
        nodes={initialNodes}
        edges={initialEdges}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
      />

      <button
        onClick={handleAutoLayout}
        className="fixed bottom-6 start-6 z-40 px-4 py-2 rounded-xl bg-white border border-gray-200 shadow text-sm text-gray-700 hover:bg-amber-50 hover:border-amber-300 transition-colors"
        title={lang === "ar" ? "ترتيب تلقائي" : "Auto layout"}
      >
        {lang === "ar" ? "✨ ترتيب تلقائي" : "✨ Auto-layout"}
      </button>

      {menu && (
        <NodeContextMenu
          target={menu}
          lang={lang}
          onClose={() => setMenu(null)}
          onAddChild={handleAddChild}
          onAddSpouse={handleAddSpouse}
          onAddParent={handleAddParent}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddPerson={handleAddStandalone}
        />
      )}

      {quickAdd && (
        <QuickAddDialog
          relation={quickAdd}
          lang={lang}
          onClose={() => {
            setQuickAdd(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
