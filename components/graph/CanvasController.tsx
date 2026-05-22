"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import type { Connection, NodeMouseHandler, EdgeMouseHandler, OnNodeDrag, OnEdgesDelete } from "@xyflow/react";
import { toast } from "sonner";
import {
  MousePointer2,
  Plus,
  Hand,
  Maximize2,
  LayoutGrid,
} from "lucide-react";
import { FamilyGraph } from "./FamilyGraph";
import { Inspector } from "./Inspector";
import { NodeContextMenu, type ContextMenuTarget } from "./NodeContextMenu";
import { QuickAddDialog, type QuickAddRelation } from "./QuickAddDialog";
import {
  RelationshipTypeDialog,
  type RelationshipChoice,
} from "./RelationshipTypeDialog";
import { CanvasOverlay } from "./CanvasOverlay";
import { updateNodePosition, autoLayoutAll } from "@/lib/actions/canvas";
import { deleteRelationship } from "@/lib/actions/relationships";
import {
  addSibling,
  deletePerson,
  linkAdopted,
  linkChild,
  linkGuardian,
  linkParentChild,
  linkSpouse,
  unlinkParent,
} from "@/lib/actions/people";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GraphNode, GraphEdge, PersonInput } from "@/lib/graph/transform";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
};

type ToolMode = "select" | "pan";

function FloatingToolbar({
  lang,
  mode,
  onMode,
  onAutoLayout,
  onFitView,
  isPending,
}: {
  lang: "ar" | "en";
  mode: ToolMode;
  onMode: (m: ToolMode) => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  isPending: boolean;
}) {
  const tools = [
    {
      id: "select" as const,
      icon: MousePointer2,
      label: lang === "ar" ? "تحديد" : "Select",
      onClick: () => onMode("select"),
      isMode: true,
    },
    {
      id: "add",
      icon: Plus,
      label: lang === "ar" ? "إضافة شخص" : "Add person",
      href: "/person/new",
      isMode: false,
    },
    {
      id: "pan" as const,
      icon: Hand,
      label: lang === "ar" ? "تحريك" : "Pan",
      onClick: () => onMode("pan"),
      isMode: true,
    },
    {
      id: "fitview",
      icon: Maximize2,
      label: lang === "ar" ? "ملاءمة العرض" : "Fit view",
      onClick: onFitView,
      isMode: false,
    },
    {
      id: "autolayout",
      icon: LayoutGrid,
      label: lang === "ar" ? "ترتيب تلقائي" : "Auto-layout",
      onClick: onAutoLayout,
      isMode: false,
    },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "absolute bottom-6 left-6 z-20",
          "flex items-center gap-1 px-2.5 py-1.5 rounded-full",
          "glass-2 border border-[var(--border)]",
          "shadow-[var(--shadow-floating)]",
        )}
      >
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.isMode && (tool.id as ToolMode) === mode;

          if ("href" in tool && tool.href) {
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <a
                    href={tool.href}
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-full",
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                      "transition-all duration-150"
                    )}
                    aria-label={tool.label}
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="top">{tool.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={tool.onClick}
                  disabled={tool.id === "autolayout" && isPending}
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full",
                    "transition-all duration-150",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    tool.id === "autolayout" && isPending && "opacity-50 cursor-not-allowed"
                  )}
                  aria-label={tool.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function CanvasControllerInner({ initialNodes, initialEdges, people, lang }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menu, setMenu] = useState<ContextMenuTarget | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddRelation | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonInput | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");

  const { fitView } = useReactFlow() as { fitView: (opts?: { padding?: number; duration?: number }) => void };
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as any[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as any[]);

  useEffect(() => { setNodes(initialNodes as any[]); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges as any[]); }, [initialEdges, setEdges]);

  // Fit view once after initial mount
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeDragStop: OnNodeDrag = (_, node) => {
    startTransition(async () => {
      await updateNodePosition(node.id, node.position.x, node.position.y);
    });
  };

  // Drag-to-link: capture the connection, then open the relationship-type
  // chooser so the user explicitly picks (Parent / Child / Spouse / etc.)
  // instead of inferring from which handle they grabbed.
  const [pendingConn, setPendingConn] = useState<{
    source: string;
    target: string;
    handle?: string | null;
  } | null>(null);

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    if (c.source === c.target) return;
    setPendingConn({ source: c.source, target: c.target, handle: c.sourceHandle });
  };

  function preselectFromHandle(handle: string | null | undefined): RelationshipChoice | undefined {
    if (handle === "left" || handle === "right") return "spouse";
    // Top/bottom handles are unlabeled; bottom→top => source is the parent.
    return "parent";
  }

  const personPersonName = (id: string) => {
    const p = people.find((x) => x.id === id);
    if (!p) return "?";
    return (
      (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?"
    );
  };

  async function handleRelationshipChoice(choice: RelationshipChoice) {
    if (!pendingConn) return;
    const { source, target } = pendingConn;
    const srcName = personPersonName(source);
    const tgtName = personPersonName(target);

    let result: { success: boolean; error?: string } | null = null;
    let okMsg = "";

    if (choice === "parent") {
      result = await linkParentChild(source, target);
      okMsg = lang === "ar" ? `${srcName} هو والد ${tgtName}` : `${srcName} linked as ${tgtName}'s parent`;
    } else if (choice === "child") {
      result = await linkParentChild(target, source);
      okMsg = lang === "ar" ? `${srcName} هو طفل ${tgtName}` : `${srcName} linked as ${tgtName}'s child`;
    } else if (choice === "spouse") {
      result = await linkSpouse(source, target, "current");
      okMsg = lang === "ar" ? `${srcName} و ${tgtName} متزوجان` : `${srcName} and ${tgtName} are married`;
    } else if (choice === "ex_spouse") {
      result = await linkSpouse(source, target, "divorced");
      okMsg = lang === "ar" ? `${srcName} و ${tgtName} مطلقان` : `${srcName} and ${tgtName} marked as divorced`;
    } else if (choice === "sibling") {
      const sibRes = await addSibling(source, target);
      result = sibRes;
      if (sibRes.success && sibRes.placeholderId) {
        okMsg = lang === "ar"
          ? `تم ربطهما كأشقاء وأضفت والداً مؤقتاً — افتحه لتعبئة الاسم`
          : `Linked as siblings — added a placeholder parent. Click it to fill in their real parent.`;
      } else {
        okMsg = lang === "ar" ? `${srcName} و ${tgtName} أشقاء` : `${srcName} and ${tgtName} are siblings`;
      }
    } else if (choice === "adopted") {
      result = await linkAdopted(source, target);
      okMsg = lang === "ar" ? `${srcName} تبنى ${tgtName}` : `${srcName} adopted ${tgtName}`;
    } else if (choice === "guardian") {
      result = await linkGuardian(source, target);
      okMsg = lang === "ar" ? `${srcName} رَبَّى ${tgtName}` : `${srcName} is ${tgtName}'s guardian`;
    } else if (choice === "unknown") {
      setPendingConn(null);
      return;
    }

    setPendingConn(null);

    if (result?.success) {
      toast.success(okMsg);
      router.refresh();
    } else if (result) {
      toast.error(result.error ?? "Couldn't create the link");
    }
  }

  const onNodeContextMenu: NodeMouseHandler = (e, node) => {
    e.preventDefault();
    setMenu({ kind: "node", personId: node.id, x: e.clientX, y: e.clientY });
  };

  // Edge context menu — right-click an edge for "Remove this connection"
  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
    source: string;
    target: string;
    edgeKind: "parent" | "spouse";
    relationshipId?: string;
    label: string;
  } | null>(null);

  const onEdgeContextMenu: EdgeMouseHandler = (e, edge) => {
    e.preventDefault();
    const data = edge.data as
      | { edgeKind?: "parent" | "spouse"; relationshipId?: string }
      | undefined;
    if (!data?.edgeKind) return;
    const srcName = people.find((p) => p.id === edge.source);
    const tgtName = people.find((p) => p.id === edge.target);
    const fmt = (p?: PersonInput) =>
      p
        ? (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ??
          "?"
        : "?";
    const label = `${fmt(srcName)} ↔ ${fmt(tgtName)}`;
    setEdgeMenu({
      x: e.clientX,
      y: e.clientY,
      edgeId: edge.id,
      source: edge.source as string,
      target: edge.target as string,
      edgeKind: data.edgeKind,
      relationshipId: data.relationshipId,
      label,
    });
  };

  async function removeCurrentEdgeRelationship(
    edgeKind: "parent" | "spouse",
    relationshipId: string | undefined,
    source: string,
    target: string,
  ): Promise<{ success: boolean; error?: string } | null> {
    if (edgeKind === "spouse" && relationshipId) {
      return await deleteRelationship(relationshipId, source);
    }
    if (edgeKind === "parent") {
      return await unlinkParent(source, target);
    }
    return null;
  }

  async function handleRemoveEdge() {
    if (!edgeMenu) return;
    const { edgeKind, relationshipId, source, target, label } = edgeMenu;
    setEdgeMenu(null);

    const result = await removeCurrentEdgeRelationship(
      edgeKind,
      relationshipId,
      source,
      target,
    );

    if (result?.success) {
      toast.success(
        lang === "ar" ? `تمت إزالة العلاقة بين ${label}` : `Removed: ${label}`,
      );
      router.refresh();
    } else if (result) {
      toast.error(result.error ?? "Couldn't remove");
    }
  }

  function handleChangeEdge() {
    if (!edgeMenu) return;
    const { source, target, edgeKind, relationshipId } = edgeMenu;
    setEdgeMenu(null);
    // Remember the edge to remove once a new type is picked.
    setReplaceConn({
      source,
      target,
      currentKind: edgeKind,
      currentRelationshipId: relationshipId,
    });
  }

  const [replaceConn, setReplaceConn] = useState<{
    source: string;
    target: string;
    currentKind: "parent" | "spouse";
    currentRelationshipId?: string;
  } | null>(null);

  async function handleReplaceRelationshipChoice(choice: RelationshipChoice) {
    if (!replaceConn) return;
    const { source, target, currentKind, currentRelationshipId } = replaceConn;
    setReplaceConn(null);

    // 1) Remove the current edge
    const removed = await removeCurrentEdgeRelationship(
      currentKind,
      currentRelationshipId,
      source,
      target,
    );
    if (removed && !removed.success) {
      toast.error(removed.error ?? "Couldn't change");
      return;
    }

    // 2) Create the new relationship using the same logic as the drag-to-link chooser
    const srcName = personPersonName(source);
    const tgtName = personPersonName(target);
    let result: { success: boolean; error?: string } | null = null;
    let okMsg = "";

    if (choice === "parent") {
      result = await linkParentChild(source, target);
      okMsg = lang === "ar" ? `${srcName} الآن والد ${tgtName}` : `${srcName} is now ${tgtName}'s parent`;
    } else if (choice === "child") {
      result = await linkParentChild(target, source);
      okMsg = lang === "ar" ? `${srcName} الآن طفل ${tgtName}` : `${srcName} is now ${tgtName}'s child`;
    } else if (choice === "spouse") {
      result = await linkSpouse(source, target, "current");
      okMsg = lang === "ar" ? `${srcName} و ${tgtName} متزوجان` : `${srcName} and ${tgtName} are now married`;
    } else if (choice === "ex_spouse") {
      result = await linkSpouse(source, target, "divorced");
      okMsg = lang === "ar" ? `${srcName} و ${tgtName} مطلقان` : `${srcName} and ${tgtName} are now divorced`;
    } else if (choice === "sibling") {
      result = await addSibling(source, target);
      okMsg = lang === "ar" ? `${srcName} و ${tgtName} الآن أشقاء` : `${srcName} and ${tgtName} are now siblings`;
    } else if (choice === "adopted") {
      result = await linkAdopted(source, target);
      okMsg = lang === "ar" ? `${srcName} تبنى ${tgtName}` : `${srcName} now adopted ${tgtName}`;
    } else if (choice === "guardian") {
      result = await linkGuardian(source, target);
      okMsg = lang === "ar" ? `${srcName} الآن ولي أمر ${tgtName}` : `${srcName} is now ${tgtName}'s guardian`;
    } else if (choice === "unknown") {
      // User wanted to remove only — already removed above
      toast.success(lang === "ar" ? "تمت الإزالة" : "Removed");
      router.refresh();
      return;
    }

    if (result?.success) {
      toast.success(okMsg);
      router.refresh();
    } else if (result) {
      toast.error(result.error ?? "Couldn't change");
    }
  }

  const onPaneContextMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setMenu({ kind: "pane", x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
  };

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e: React.MouseEvent, node: { id: string }) => {
      const person = people.find((p) => p.id === node.id) ?? null;
      setSelectedPerson(person);
    },
    [people]
  );

  const onPaneClick = useCallback(() => {
    setSelectedPerson(null);
  }, []);

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

  const onEdgesDelete: OnEdgesDelete = useCallback((deletedEdges) => {
    for (const edge of deletedEdges) {
      const data = edge.data as { edgeKind?: string; relationshipId?: string } | undefined;
      if (data?.edgeKind === "spouse" && data.relationshipId) {
        const rid = data.relationshipId;
        const pid = edge.source as string;
        startTransition(async () => {
          await deleteRelationship(rid, pid);
          router.refresh();
        });
      } else if (data?.edgeKind === "parent") {
        // Determine which FK to clear: edge.id is "f-{childId}" or "m-{childId}"
        const childId = edge.target as string;
        const parentId = edge.source as string;
        startTransition(async () => {
          const supabase = (await import("@/lib/supabase/client")).createClient();
          const { data: child } = await supabase
            .from("people")
            .select("father_id, mother_id")
            .eq("id", childId)
            .maybeSingle();
          if (!child) return;
          const field = child.father_id === parentId ? "father_id" : "mother_id";
          await supabase.from("people").update({ [field]: null }).eq("id", childId);
          router.refresh();
        });
      }
    }
  }, [router, startTransition]);

  function handleAddChild() {
    if (menu?.kind !== "node") return;
    const parent = personById(menu.personId);
    if (!parent) return;
    setMenu(null);

    // Find spouse to link both parents
    const spouseEdge = edges.find(
      (e) =>
        e.data?.edgeKind === "spouse" &&
        (e.source === parent.id || e.target === parent.id)
    );
    if (spouseEdge) {
      const spouseId = spouseEdge.source === parent.id ? spouseEdge.target : spouseEdge.source;
      const spouse = personById(spouseId);
      const fatherId = parent.gender !== "f" ? parent.id : (spouse?.gender !== "f" ? spouseId : undefined);
      const motherId = parent.gender === "f" ? parent.id : (spouse?.gender === "f" ? spouseId : undefined);
      const params = new URLSearchParams();
      if (fatherId) params.set("father", fatherId);
      if (motherId) params.set("mother", motherId);
      router.push(`/person/new?${params.toString()}`);
    } else {
      setQuickAdd({ kind: "child", parentId: parent.id, parentGender: parent.gender });
    }
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

  function handleFitView() {
    fitView({ padding: 0.15, duration: 400 });
  }

  const panOnDrag: number[] = toolMode === "pan" ? [0, 1, 2] : [1, 2];

  return (
    <div className="relative w-full h-full">
      <FamilyGraph
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgesDelete={onEdgesDelete}
        panOnDrag={panOnDrag}
        selectionMode={toolMode === "select"}
      />

      <FloatingToolbar
        lang={lang}
        mode={toolMode}
        onMode={setToolMode}
        onAutoLayout={handleAutoLayout}
        onFitView={handleFitView}
        isPending={isPending}
      />

      <CanvasOverlay lang={lang} />

      <Inspector
        person={selectedPerson}
        lang={lang}
        onClose={() => setSelectedPerson(null)}
        people={people}
        edges={edges as unknown as import("@/lib/graph/transform").GraphEdge[]}
        fatherName={
          selectedPerson?.father_id
            ? (() => {
                const p = people.find((x) => x.id === selectedPerson.father_id);
                return p ? (lang === "ar" ? (p.given_ar ?? p.given_en) : (p.given_en ?? p.given_ar)) ?? null : null;
              })()
            : null
        }
        motherName={
          selectedPerson?.mother_id
            ? (() => {
                const p = people.find((x) => x.id === selectedPerson.mother_id);
                return p ? (lang === "ar" ? (p.given_ar ?? p.given_en) : (p.given_en ?? p.given_ar)) ?? null : null;
              })()
            : null
        }
      />

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

      {edgeMenu && (
        <>
          {/* Backdrop to dismiss on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setEdgeMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setEdgeMenu(null); }}
          />
          <div
            role="menu"
            className="glass-2 fixed z-50 flex flex-col gap-1 rounded-xl border border-[var(--border)] p-2 shadow-[var(--shadow-deep)] min-w-[14rem]"
            style={{ left: edgeMenu.x, top: edgeMenu.y }}
          >
            <div className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              {edgeMenu.label}
            </div>
            <button
              type="button"
              onClick={handleChangeEdge}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <span aria-hidden>↻</span>
              {lang === "ar" ? "تغيير نوع العلاقة" : "Change relationship type…"}
            </button>
            <button
              type="button"
              onClick={handleRemoveEdge}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/8"
            >
              <span aria-hidden>✕</span>
              {lang === "ar" ? "إزالة هذه العلاقة" : "Remove this connection"}
            </button>
            <button
              type="button"
              onClick={() => setEdgeMenu(null)}
              className="rounded-lg px-2 py-1.5 text-left text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </>
      )}

      {pendingConn && (
        <RelationshipTypeDialog
          open
          onOpenChange={(o) => { if (!o) setPendingConn(null); }}
          source={people.find((p) => p.id === pendingConn.source) ?? null}
          target={people.find((p) => p.id === pendingConn.target) ?? null}
          lang={lang}
          preselect={preselectFromHandle(pendingConn.handle)}
          onChoose={handleRelationshipChoice}
          onCancel={() => setPendingConn(null)}
        />
      )}

      {replaceConn && (
        <RelationshipTypeDialog
          open
          onOpenChange={(o) => { if (!o) setReplaceConn(null); }}
          source={people.find((p) => p.id === replaceConn.source) ?? null}
          target={people.find((p) => p.id === replaceConn.target) ?? null}
          lang={lang}
          preselect={replaceConn.currentKind === "spouse" ? "spouse" : "parent"}
          onChoose={handleReplaceRelationshipChoice}
          onCancel={() => setReplaceConn(null)}
        />
      )}
    </div>
  );
}

export function CanvasController(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasControllerInner {...props} />
    </ReactFlowProvider>
  );
}
