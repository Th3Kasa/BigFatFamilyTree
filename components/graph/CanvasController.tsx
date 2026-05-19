"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { Connection, NodeMouseHandler, OnNodeDrag, OnEdgesDelete } from "@xyflow/react";
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
import { updateNodePosition, autoLayoutAll } from "@/lib/actions/canvas";
import { createRelationship, deleteRelationship } from "@/lib/actions/relationships";
import { deletePerson } from "@/lib/actions/people";
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
          "absolute bottom-8 left-1/2 -translate-x-1/2 z-20",
          "flex items-center gap-1 px-3 py-2 rounded-full",
          "bg-white/90 backdrop-blur-md border border-border",
          "shadow-[0_1px_2px_rgb(20_20_20/0.06),0_8px_24px_rgb(20_20_20/0.1)]"
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
      }
    }
  }, [router, startTransition]);

  function handleAddChild() {
    if (menu?.kind !== "node") return;
    const parent = personById(menu.personId);
    if (!parent) return;
    setMenu(null);

    // Find spouse to link both parents
    const spouseEdge = initialEdges.find(
      (e) =>
        e.data?.edgeKind === "spouse" &&
        (e.source === parent.id || e.target === parent.id)
    );
    if (spouseEdge) {
      const spouseId = spouseEdge.source === parent.id ? spouseEdge.target : spouseEdge.source;
      const spouse = personById(spouseId);
      const fatherId = parent.gender !== "f" ? parent.id : (spouse?.gender !== "f" ? spouseId : parent.id);
      const motherId = parent.gender === "f" ? parent.id : (spouse?.gender === "f" ? spouseId : spouseId);
      router.push(`/person/new?father=${fatherId}&mother=${motherId}`);
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
        nodes={initialNodes}
        edges={initialEdges}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
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

      <Inspector
        person={selectedPerson}
        lang={lang}
        onClose={() => setSelectedPerson(null)}
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
