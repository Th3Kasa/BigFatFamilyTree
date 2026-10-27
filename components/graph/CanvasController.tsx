"use client";

import { useState, useTransition, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import type { Connection, NodeMouseHandler, EdgeMouseHandler, OnNodeDrag, OnEdgesDelete } from "@xyflow/react";
import { toast } from "sonner";
import {
  Hand,
  LayoutGrid,
  LocateFixed,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Route,
} from "lucide-react";
import { FamilyGraph } from "./FamilyGraph";
import { Inspector, type InspectorHandle } from "./Inspector";
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
  deletePersonCanvas,
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
import { cn, getDisplayName } from "@/lib/utils";
import { shell } from "@/lib/client/shell-store";
import {
  applyEdgeHighlight,
  buildHighlightIndex,
  nodeHighlight,
  type PathHighlight,
} from "@/lib/graph/highlight";
import type { GraphNode, GraphEdge, PersonInput } from "@/lib/graph/transform";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
  /** Guest (signed-out) view: pan/zoom only, no editing, no detail drawer. */
  readOnly?: boolean;
  /**
   * Signed-out visitor. Defaults to `readOnly`; pass `false` for a read-only view
   * a signed-in person is looking at (e.g. the relationship finder).
   */
  guest?: boolean;
  /** Relationship-finder path to light up; everything else fades back. */
  highlight?: PathHighlight | null;
  /** Pan/zoom to this person on load and select them (`/?focus=<id>`). */
  focusId?: string | null;
  /** The signed-in member's own person: "You" badge + "Center on me". */
  meId?: string | null;
};

type ToolMode = "select" | "pan";

const pillButton =
  "flex h-11 min-w-11 items-center justify-center gap-1.5 px-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-40";

/** Zoom −/+ and Fit, plus "Center on me" / "Focus on the path" when they apply. */
function ViewControls({
  lang,
  onZoomOut,
  onZoomIn,
  onFit,
  onFocusPath,
  onCenterMe,
}: {
  lang: "ar" | "en";
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  onFocusPath?: () => void;
  onCenterMe?: () => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <div
      role="group"
      aria-label={t("Zoom and view", "التكبير والعرض")}
      className="absolute bottom-3 end-3 z-20 flex items-center divide-x divide-[var(--border)] overflow-hidden rounded-full border border-[var(--border-strong)] bg-[var(--card)] shadow-[var(--shadow-floating)] rtl:divide-x-reverse md:bottom-4 md:end-4"
    >
      {onCenterMe && (
        <button type="button" onClick={onCenterMe} className={cn(pillButton, "ps-4")}>
          <LocateFixed className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("Center on me", "مركّز عليّ")}</span>
          <span className="sr-only sm:hidden">{t("Center on me", "مركّز عليّ")}</span>
        </button>
      )}
      {onFocusPath && (
        <button
          type="button"
          onClick={onFocusPath}
          aria-label={t("Focus on the path", "تركيز على المسار")}
          title={t("Focus on the path", "تركيز على المسار")}
          className={cn(pillButton, "text-[var(--path)]")}
        >
          <Route className="h-4 w-4" aria-hidden />
        </button>
      )}
      <button type="button" onClick={onZoomOut} aria-label={t("Zoom out", "تصغير")} title={t("Zoom out", "تصغير")} className={pillButton}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onZoomIn} aria-label={t("Zoom in", "تكبير")} title={t("Zoom in", "تكبير")} className={pillButton}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onFit}
        aria-label={t("Fit the whole tree", "عرض الشجرة كاملة")}
        title={t("Fit the whole tree", "عرض الشجرة كاملة")}
        className={cn(pillButton, "pe-4")}
      >
        <Maximize2 className="h-4 w-4" aria-hidden />
        <span aria-hidden>{t("Fit", "ملاءمة")}</span>
      </button>
    </div>
  );
}

/** Editor tools: pointer vs. hand mode and auto-layout. */
function EditTools({
  lang,
  mode,
  onMode,
  onAutoLayout,
  isPending,
}: {
  lang: "ar" | "en";
  mode: ToolMode;
  onMode: (m: ToolMode) => void;
  onAutoLayout: () => void;
  isPending: boolean;
}) {
  const tools = [
    { id: "select" as const, icon: MousePointer2, label: lang === "ar" ? "تحديد" : "Select", onClick: () => onMode("select") },
    { id: "pan" as const, icon: Hand, label: lang === "ar" ? "تحريك" : "Move around", onClick: () => onMode("pan") },
    { id: "autolayout" as const, icon: LayoutGrid, label: lang === "ar" ? "ترتيب تلقائي" : "Tidy up the layout", onClick: onAutoLayout },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-orientation="vertical"
        aria-label={lang === "ar" ? "أدوات التحرير" : "Editing tools"}
        className="absolute end-3 top-3 z-20 flex flex-col gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--card)] p-1 shadow-[var(--shadow-floating)] md:end-4 md:top-4"
      >
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isMode = tool.id !== "autolayout";
          const isActive = isMode && tool.id === mode;
          const busy = tool.id === "autolayout" && isPending;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={tool.onClick}
                  disabled={busy}
                  aria-label={tool.label}
                  aria-pressed={isMode ? isActive : undefined}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isActive
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                    busy && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side={lang === "ar" ? "right" : "left"}>{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function CanvasControllerInner({ initialNodes, initialEdges, people, lang, readOnly = false, guest, highlight, focusId, meId }: Props) {
  const isGuest = guest ?? readOnly;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menu, setMenu] = useState<ContextMenuTarget | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddRelation | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonInput | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");

  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const inspectorRef = useRef<InspectorHandle>(null);
  const selectedPersonRef = useRef(selectedPerson);
  selectedPersonRef.current = selectedPerson;

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as any[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as any[]);

  // Sync from server — skip while a mutation is in-flight to avoid snapping
  // dragged nodes back to their pre-drag positions mid-transition.
  useEffect(() => { if (!isPending) setNodes(initialNodes as any[]); }, [initialNodes, setNodes, isPending]);
  useEffect(() => { if (!isPending) setEdges(initialEdges as any[]); }, [initialEdges, setEdges, isPending]);

  // Re-sync selectedPerson when people list refreshes so Inspector stays current.
  // Read via ref to avoid a stale closure when people changes rapidly.
  useEffect(() => {
    const current = selectedPersonRef.current;
    if (current) {
      const updated = people.find((p) => p.id === current.id) ?? null;
      setSelectedPerson(updated);
    }
  }, [people]);

  const highlightIndex = useMemo(() => buildHighlightIndex(highlight), [highlight]);

  // Pan/zoom to one person and select them (search, `/?focus=`, "Center on me").
  const focusOn = useCallback(
    (personId: string) => {
      const person = people.find((p) => p.id === personId);
      if (!person) return false;
      setNodes((ns) => ns.map((n) => (n.selected === (n.id === personId) ? n : { ...n, selected: n.id === personId })));
      fitView({ nodes: [{ id: personId }], minZoom: 1, maxZoom: 1, duration: 500 });
      if (!readOnly) setSelectedPerson(person);
      return true;
    },
    [people, readOnly, fitView, setNodes],
  );

  // Frame on first mount: the focused person, else a readable zoom (≥0.8)
  // centred on the tree rather than fit-all at a tiny scale. With a path
  // active, frame the path; re-frame whenever the highlighted set changes.
  const highlightedIds = highlightIndex ? highlight!.nodeIds : null;
  const highlightKey = highlightedIds ? highlightedIds.join(",") : "";
  const framedOnce = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (highlightKey) {
        fitView({ nodes: highlightKey.split(",").map((id) => ({ id })), padding: 0.3, duration: 500, maxZoom: 1.1 });
      } else if (!framedOnce.current) {
        if (!(focusId && focusOn(focusId))) {
          fitView({ padding: 0.15, minZoom: 0.8, maxZoom: 1, duration: 300 });
        }
      }
      framedOnce.current = true;
    }, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitView is stable; only re-frame when the highlighted set changes
  }, [highlightKey]);

  // `?focus=` is a one-shot instruction: drop it from the address once handled
  // so a refresh or a later "Back" doesn't jump again.
  useEffect(() => {
    if (!focusId) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("focus")) return;
    url.searchParams.delete("focus");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, [focusId]);

  // The top-bar search asks a mounted canvas to focus someone.
  useEffect(() => shell.onFocusRequest((id) => void focusOn(id)), [focusOn]);

  // Tell the Add menu who is selected ("Adding to Mariam").
  useEffect(() => {
    if (readOnly) return;
    shell.setCanvasPerson(
      selectedPerson
        ? { id: selectedPerson.id, slug: selectedPerson.slug, name: getDisplayName(selectedPerson, lang) }
        : null,
    );
  }, [selectedPerson, readOnly, lang]);
  useEffect(() => () => shell.setCanvasPerson(null), []);

  // Edges carry their highlight state only while a path is active, so the
  // no-highlight path (normal editing/dragging) is untouched.
  const displayEdges = useMemo(
    () =>
      highlightIndex
        ? (edges as unknown as GraphEdge[]).map((e) => applyEdgeHighlight(e, highlightIndex))
        : edges,
    [edges, highlightIndex],
  );

  // Inject onQuickAdd callbacks so node card buttons open the Inspector quick-add
  // panel instead of navigating to the full /person/new form.
  const nodesWithCallbacks = useMemo(() =>
    (nodes as import("@/lib/graph/transform").GraphNode[]).map((n) => ({
      ...n,
      data: {
        ...n.data,
        readOnly,
        isMe: meId ? n.id === meId : undefined,
        highlight: highlightIndex ? nodeHighlight(highlightIndex, n.id) : undefined,
        onQuickAdd: readOnly
          ? undefined
          : (kind: "child" | "spouse") => {
              const person = people.find((p) => p.id === n.id) ?? null;
              if (selectedPersonRef.current?.id === n.id) {
                inspectorRef.current?.openWithQuickAdd(kind);
              } else {
                setSelectedPerson(person);
                // setTimeout fires after React effects flush, including the Inspector's
                // person-change reset effect, so openWithQuickAdd wins.
                setTimeout(() => inspectorRef.current?.openWithQuickAdd(kind), 0);
              }
            },
      },
    })),
    [nodes, people, readOnly, highlightIndex, meId],
  );

  const onNodeDragStop: OnNodeDrag = (_, node) => {
    if (readOnly) return;
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
    if (readOnly) return;
    if (!c.source || !c.target) return;
    if (c.source === c.target) return;
    setPendingConn({ source: c.source, target: c.target, handle: c.sourceHandle });
  };

  function preselectFromHandle(handle: string | null | undefined): RelationshipChoice | undefined {
    if (handle === "left" || handle === "right") return "spouse";
    if (handle === "bottom" || handle == null) return "parent";
    return undefined; // top is a target handle, can't be dragged from
  }

  const personPersonName = (id: string) => {
    const p = people.find((x) => x.id === id);
    if (!p) return "?";
    return (
      (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?"
    );
  };

  function handleRelationshipChoice(choice: RelationshipChoice) {
    if (!pendingConn) return;
    const { source, target } = pendingConn;
    const srcName = personPersonName(source);
    const tgtName = personPersonName(target);

    if (choice === "unknown") {
      setPendingConn(null);
      return;
    }

    setPendingConn(null);

    startTransition(async () => {
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
        result = await addSibling(source, target);
        okMsg = lang === "ar" ? `${srcName} و ${tgtName} أشقاء` : `${srcName} and ${tgtName} are siblings`;
      } else if (choice === "adopted") {
        result = await linkAdopted(source, target);
        okMsg = lang === "ar" ? `${srcName} تبنى ${tgtName}` : `${srcName} adopted ${tgtName}`;
      } else if (choice === "guardian") {
        result = await linkGuardian(source, target);
        okMsg = lang === "ar" ? `${srcName} رَبَّى ${tgtName}` : `${srcName} is ${tgtName}'s guardian`;
      }

      if (result?.success) {
        toast.success(okMsg);
        router.refresh();
      } else if (result) {
        toast.error(result.error ?? "Couldn't create the link");
      }
    });
  }

  const onNodeContextMenu: NodeMouseHandler = (e, node) => {
    e.preventDefault();
    if (readOnly) return;
    setMenu({ kind: "node", personId: node.id, x: e.clientX, y: e.clientY });
  };

  // Edge context menu — right-click an edge for "Remove this connection"
  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
    source: string;
    target: string;
    edgeKind: "parent" | "spouse" | "adopted" | "guardian";
    relationshipId?: string;
    label: string;
  } | null>(null);

  const onEdgeContextMenu: EdgeMouseHandler = (e, edge) => {
    e.preventDefault();
    if (readOnly) return;
    const data = edge.data as
      | { edgeKind?: "parent" | "spouse" | "family-branch" | "adopted" | "guardian"; relationshipId?: string }
      | undefined;
    if (!data?.edgeKind || data.edgeKind === "family-branch") return;
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
    edgeKind: "parent" | "spouse" | "adopted" | "guardian",
    relationshipId: string | undefined,
    source: string,
    target: string,
  ): Promise<{ success: boolean; error?: string } | null> {
    if (edgeKind === "spouse" && relationshipId) {
      return await deleteRelationship(relationshipId, source);
    }
    if ((edgeKind === "adopted" || edgeKind === "guardian") && relationshipId) {
      return await deleteRelationship(relationshipId, source);
    }
    if (edgeKind === "parent") {
      return await unlinkParent(source, target);
    }
    return null;
  }

  function handleRemoveEdge() {
    if (!edgeMenu) return;
    const { edgeKind, relationshipId, source, target, label } = edgeMenu;
    setEdgeMenu(null);
    startTransition(async () => {
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
    });
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
    currentKind: "parent" | "spouse" | "adopted" | "guardian";
    currentRelationshipId?: string;
  } | null>(null);

  function handleReplaceRelationshipChoice(choice: RelationshipChoice) {
    if (!replaceConn) return;
    const { source, target, currentKind, currentRelationshipId } = replaceConn;
    setReplaceConn(null);

    startTransition(async () => {
      // 1) Remove the current edge
      const removed = await removeCurrentEdgeRelationship(
        currentKind,
        currentRelationshipId,
        source,
        target,
      );
      if (!removed || !removed.success) {
        toast.error(removed?.error ?? "Couldn't remove existing connection");
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
    });
  }

  const onPaneContextMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setMenu({ kind: "pane", x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
  };

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e: React.MouseEvent, node: { id: string }) => {
      const person = people.find((p) => p.id === node.id) ?? null;
      // Guests can see the tree but not per-person details — nudge them to sign in.
      if (readOnly && !isGuest) {
        // Signed-in, read-only (relationship finder): offer the profile instead of navigating on a stray tap.
        if (person) {
          toast(getDisplayName(person, lang), {
            action: {
              label: lang === "ar" ? "فتح الملف" : "Open profile",
              onClick: () => router.push(`/person/${person.slug ?? person.id}`),
            },
          });
        }
        return;
      }
      if (readOnly) {
        const name = person
          ? (lang === "ar" ? person.given_ar ?? person.given_en : person.given_en ?? person.given_ar)
          : null;
        toast(
          lang === "ar"
            ? `سجّل الدخول لعرض تفاصيل ${name ?? "هذا الشخص"}`
            : `Sign in to see ${name ?? "this person"}'s details`,
          {
            action: {
              label: lang === "ar" ? "تسجيل الدخول" : "Sign in",
              onClick: () => router.push("/login"),
            },
          },
        );
        return;
      }
      setSelectedPerson(person);
    },
    [people, readOnly, isGuest, lang, router]
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

  const [deleteNodeConfirm, setDeleteNodeConfirm] = useState<string | null>(null);

  function handleDelete() {
    if (menu?.kind !== "node") return;
    const id = menu.personId;
    if (deleteNodeConfirm !== id) {
      setDeleteNodeConfirm(id);
      return;
    }
    setDeleteNodeConfirm(null);
    setMenu(null);
    startTransition(async () => {
      const r = await deletePersonCanvas(id);
      if (r.success) {
        router.refresh();
      } else {
        toast.error(r.error ?? "Delete failed");
      }
    });
  }

  const onEdgesDelete: OnEdgesDelete = useCallback((deletedEdges) => {
    for (const edge of deletedEdges) {
      const data = edge.data as { edgeKind?: string; relationshipId?: string } | undefined;
      if (data?.edgeKind === "family-branch") continue; // handled via Inspector
      if (data?.edgeKind === "spouse" && data.relationshipId) {
        const rid = data.relationshipId;
        const pid = edge.source as string;
        startTransition(async () => {
          const r = await deleteRelationship(rid, pid);
          if (r?.success) router.refresh();
          else toast.error(r?.error ?? "Couldn't remove connection");
        });
      } else if ((data?.edgeKind === "adopted" || data?.edgeKind === "guardian") && data.relationshipId) {
        const rid = data.relationshipId;
        const pid = edge.source as string;
        startTransition(async () => {
          const r = await deleteRelationship(rid, pid);
          if (r?.success) router.refresh();
          else toast.error(r?.error ?? "Couldn't remove connection");
        });
      }
      // Note: "parent" edgeKind is never produced by buildGraphElements —
      // parent-child links use family-branch edges (deletable: false) and are
      // removed via the Inspector's unlink buttons, not edge deletion.
    }
  }, [router, startTransition]);

  function openInspectorQuickAdd(personId: string, kind: "child" | "spouse" | "parent" | "sibling") {
    const person = people.find((p) => p.id === personId) ?? null;
    if (selectedPersonRef.current?.id === personId) {
      inspectorRef.current?.openWithQuickAdd(kind);
    } else {
      setSelectedPerson(person);
      setTimeout(() => inspectorRef.current?.openWithQuickAdd(kind), 0);
    }
  }

  function handleAddChild() {
    if (menu?.kind !== "node") return;
    const id = menu.personId;
    setMenu(null);
    openInspectorQuickAdd(id, "child");
  }

  function handleAddSpouse() {
    if (menu?.kind !== "node") return;
    const id = menu.personId;
    setMenu(null);
    openInspectorQuickAdd(id, "spouse");
  }

  function handleAddParent() {
    if (menu?.kind !== "node") return;
    const id = menu.personId;
    setMenu(null);
    openInspectorQuickAdd(id, "parent");
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

  const meOnTree = !!meId && people.some((p) => p.id === meId);

  const panOnDrag: number[] = toolMode === "pan" ? [0, 1] : [1, 2];

  return (
    <div className="relative w-full h-full">
      <FamilyGraph
        nodes={nodesWithCallbacks}
        edges={displayEdges as typeof edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgesDelete={readOnly ? undefined : onEdgesDelete}
        panOnDrag={panOnDrag}
        selectionMode={!readOnly && toolMode === "select"}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
      />

      {!readOnly && (
        <EditTools
          lang={lang}
          mode={toolMode}
          onMode={setToolMode}
          onAutoLayout={handleAutoLayout}
          isPending={isPending}
        />
      )}

      <ViewControls
        lang={lang}
        onZoomOut={() => zoomOut({ duration: 200 })}
        onZoomIn={() => zoomIn({ duration: 200 })}
        onFit={handleFitView}
        onFocusPath={
          highlightIndex
            ? () => fitView({ nodes: highlight!.nodeIds.map((id) => ({ id })), padding: 0.3, duration: 500, maxZoom: 1.1 })
            : undefined
        }
        onCenterMe={meOnTree ? () => focusOn(meId!) : undefined}
      />

      <CanvasOverlay lang={lang} readOnly={readOnly} pathLegend={!!highlightIndex} />

      {!readOnly && (
      <>
      <Inspector
        ref={inspectorRef}
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
          personName={menu.kind === "node" ? (() => {
            const p = people.find((x) => x.id === menu.personId);
            return p ? (lang === "ar" ? (p.given_ar ?? p.given_en) : (p.given_en ?? p.given_ar)) ?? undefined : undefined;
          })() : undefined}
          onClose={() => { setMenu(null); setDeleteNodeConfirm(null); }}
          onAddChild={handleAddChild}
          onAddSpouse={handleAddSpouse}
          onAddParent={handleAddParent}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddPerson={handleAddStandalone}
          deleteConfirm={menu?.kind === "node" && deleteNodeConfirm === menu.personId}
        />
      )}

      {quickAdd && (
        <QuickAddDialog
          relation={quickAdd}
          lang={lang}
          onClose={(didSave) => {
            setQuickAdd(null);
            if (didSave) router.refresh();
          }}
        />
      )}

      {edgeMenu && (
        <>
          {/* Backdrop to dismiss on outside click */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40"
            onClick={() => setEdgeMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setEdgeMenu(null); }}
          />
          <div
            role="menu"
            aria-label={lang === "ar" ? `خيارات: ${edgeMenu.label}` : `Options: ${edgeMenu.label}`}
            className="fixed z-50 flex min-w-[14rem] flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-[var(--shadow-deep)]"
            style={{
              left: Math.min(edgeMenu.x, window.innerWidth - 240),
              top: Math.min(edgeMenu.y, window.innerHeight - 200),
            }}
          >
            <div className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              {edgeMenu.label}
            </div>
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={handleChangeEdge}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <span aria-hidden>↻</span>
              {lang === "ar" ? "تغيير نوع العلاقة" : "Change relationship type…"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleRemoveEdge}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/8"
            >
              <span aria-hidden>✕</span>
              {lang === "ar" ? "إزالة هذه العلاقة" : "Remove this connection"}
            </button>
            <button
              type="button"
              role="menuitem"
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
      </>
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
