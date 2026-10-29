"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactFlowProvider, ViewportPortal, useEdgesState, useNodesInitialized, useNodesState, useReactFlow, useStore, type Edge, type Node, type NodeChange, type NodeMouseHandler, type OnMoveStart, type OnNodeDrag } from "@xyflow/react";
import { toast } from "sonner";
import { LayoutGrid, LocateFixed, Maximize2, Minus, Plus, Route } from "lucide-react";
import { FamilyGraph } from "./FamilyGraph";
import { CanvasOverlay } from "./CanvasOverlay";
import { FamilyHub } from "@/components/family/FamilyHub";
import { FamilyView } from "@/components/family/FamilyView";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveCardOffset, autoLayoutAll } from "@/lib/actions/canvas";
import { clusterMates, manualOffset, nudgeFor, ROW_HEIGHT } from "@/lib/graph/layout";
import { buildFamilyModel } from "@/lib/graph/units";
import { cn, getDisplayName } from "@/lib/utils";
import { shell } from "@/lib/client/shell-store";
import { useMediaQuery, DESKTOP_QUERY } from "@/lib/client/use-media-query";
import { useCurrentPerson } from "@/components/providers/current-person-provider";
import { useRole } from "@/components/providers/role-provider";
import { applyEdgeHighlight, buildHighlightIndex, nodeHighlight, type PathHighlight } from "@/lib/graph/highlight";
import { defaultFamilyFocus } from "@/lib/graph/family-view";
import { COMPACT_ZOOM, FIT_ALL, resolveViewportIntent } from "@/lib/graph/viewport";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/node-size";
import { buildGraphElements, relationshipsFromEdges, type GraphEdge, type GraphNode, type PersonInput, type SlotKind } from "@/lib/graph/transform";
import type { RelativeSlot } from "@/lib/people/relative-copy";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
  /** Read-only view: explore the tree but no family panel or editing. */
  readOnly?: boolean;
  /** Signed-out visitor. Defaults to `readOnly`; `false` for a signed-in read-only view (the finder). */
  guest?: boolean;
  /** Relationship-finder path to light up; everything else fades back. */
  highlight?: PathHighlight | null;
  /** Open centred on this person and select them (`/?focus=<id>`). */
  focusId?: string | null;
  /** The signed-in member's own person (defaults to the linked person from the layout). */
  meId?: string | null;
};

type View = "tree" | "family";

/** Width the desktop family panel covers, so a focused card isn't hidden behind it. */
const PANEL_W = 392;
const FOCUS_ZOOM = 0.9;

const pillButton =
  "flex h-11 min-w-10 items-center justify-center gap-1.5 px-2.5 text-sm font-semibold sm:min-w-11 sm:px-3 text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-40";

/** Zoom −/+ and Fit, plus "Center on me" / "Focus on the path" when they apply. */
function ViewControls({ lang, onZoomOut, onZoomIn, onFit, onFocusPath, onCenterMe, besidePanel }: {
  lang: "ar" | "en";
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  onFocusPath?: () => void;
  onCenterMe?: () => void;
  /** The desktop family panel is open: sit beside it, not under it. */
  besidePanel?: boolean;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <div
      role="group"
      aria-label={t("Zoom and view", "التكبير والعرض")}
      className={cn("absolute bottom-3 end-3 z-20 flex items-center divide-x divide-[var(--border)] overflow-hidden rounded-full border border-[var(--border-strong)] bg-[var(--card)] shadow-[var(--shadow-floating)] rtl:divide-x-reverse md:bottom-4 md:end-4", besidePanel && "md:end-[404px]")}
    >
      {onCenterMe && (
        <button type="button" onClick={onCenterMe} className={cn(pillButton, "ps-4")}>
          <LocateFixed className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("Center on me", "تركيز عليّ")}</span>
          <span className="sr-only sm:hidden">{t("Center on me", "تركيز عليّ")}</span>
        </button>
      )}
      {onFocusPath && (
        <button type="button" onClick={onFocusPath} aria-label={t("Focus on the path", "تركيز على المسار")} title={t("Focus on the path", "تركيز على المسار")} className={cn(pillButton, "text-[var(--path)]")}>
          <Route className="h-4 w-4" aria-hidden />
        </button>
      )}
      <button type="button" onClick={onZoomOut} aria-label={t("Zoom out", "تصغير")} title={t("Zoom out", "تصغير")} className={pillButton}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onZoomIn} aria-label={t("Zoom in", "تكبير")} title={t("Zoom in", "تكبير")} className={pillButton}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onFit} aria-label={t("Fit the whole tree", "عرض الشجرة كاملة")} title={t("Fit the whole tree", "عرض الشجرة كاملة")} className={cn(pillButton, "pe-4")}>
        <Maximize2 className="h-4 w-4" aria-hidden />
        <span aria-hidden>{t("Fit", "ملاءمة")}</span>
      </button>
    </div>
  );
}

/** Editor tools: pointer vs. hand mode, and (admins) a labelled "Tidy up". */
function EditTools({ lang, onTidy, canTidy, moved, busy, besidePanel }: {
  lang: "ar" | "en";
  onTidy: () => void;
  canTidy: boolean;
  /** Cards nudged by hand; "Tidy up" puts them back. */
  moved: number;
  busy: boolean;
  besidePanel?: boolean;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <div className={cn("absolute end-3 top-3 z-20 flex items-start gap-2 md:end-4 md:top-4", besidePanel && "md:end-[404px]")}>
      {canTidy && (
        <button
          type="button"
          onClick={onTidy}
          disabled={busy}
          className="relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-3 sm:px-4 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow-floating)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">{busy ? t("Tidying…", "جارٍ الترتيب…") : t("Tidy up", "ترتيب الشجرة")}</span>
          {moved > 0 && !busy && (
            <span className="rounded-full bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary)]">
              <span className="sr-only">{t(", cards moved by hand: ", "، بطاقات نُقلت يدويًا: ")}</span>
              {moved}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/** "Family view | Full tree". */
function ViewToggle({ lang, view, onChange }: { lang: "ar" | "en"; view: View; onChange: (v: View) => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const btn = (on: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
      on ? "bg-[var(--foreground)] text-white" : "text-[var(--foreground)] hover:bg-[var(--muted)]",
    );
  return (
    <div role="group" aria-label={t("How to show the family", "طريقة عرض العائلة")} className="absolute start-3 top-3 z-30 flex gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--card)] p-1 shadow-[var(--shadow-floating)] md:start-4 md:top-4">
      <button type="button" aria-pressed={view === "family"} onClick={() => onChange("family")} className={btn(view === "family")}>
        {t("Family view", "عرض العائلة")}
      </button>
      <button type="button" aria-pressed={view === "tree"} onClick={() => onChange("tree")} className={btn(view === "tree")}>
        {t("Full tree", "الشجرة كاملة")}
      </button>
    </div>
  );
}

/** "Generation 1", "الجيل ١" at the start of each row of the full tree. */
function RowLabels({ nodes, lang }: { nodes: GraphNode[]; lang: "ar" | "en" }) {
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);
  const cards = nodes.filter((n) => n.type === "person");
  if (cards.length === 0) return null;
  const minX = Math.min(...cards.map((n) => n.position.x));
  const rows = [...new Set(cards.map((n) => n.position.y))].sort((a, b) => a - b);
  const arabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  return (
    <ViewportPortal>
      {rows.map((y) => {
        const n = Math.round(y / ROW_HEIGHT) + 1;
        return (
          <div
            key={y}
            aria-hidden
            className={cn("pointer-events-none absolute select-none whitespace-nowrap font-semibold text-[var(--muted-foreground)]", compact ? "text-[40px]" : "text-sm")}
            style={{ transform: `translate(${minX - (compact ? 340 : 150)}px, ${y + NODE_HEIGHT / 2}px) translateY(-50%)` }}
          >
            {lang === "ar" ? `الجيل ${arabicDigits(n)}` : `Generation ${n}`}
          </div>
        );
      })}
    </ViewportPortal>
  );
}

function CanvasControllerInner({ initialEdges, people, lang, readOnly = false, guest, highlight, focusId, meId: meIdProp }: Props) {
  const isGuest = guest ?? readOnly;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [, startTransition] = useTransition();
  const [tidying, startTidy] = useTransition();
  const { canEdit: roleCanEdit, isAdmin } = useRole();
  const canEdit = roleCanEdit && !readOnly;
  const me = useCurrentPerson();
  const meId = meIdProp ?? me?.id ?? null;
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const { fitView, zoomIn, zoomOut, setCenter, getZoom, getViewport, setViewport } = useReactFlow();
  const nodesReady = useNodesInitialized();

  const relationships = useMemo(() => relationshipsFromEdges(initialEdges), [initialEdges]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Sideways nudges saved from this screen, layered over the server data until
  // the refreshed props carry them, so a dropped card never snaps back.
  const [nudges, setNudges] = useState<Map<string, number>>(() => new Map());
  const [seenPeople, setSeenPeople] = useState(people);
  if (seenPeople !== people) {
    setSeenPeople(people);
    setNudges((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const [id, offset] of prev) {
        const p = people.find((x) => x.id === id);
        if (!p || manualOffset(p) === offset) next.delete(id);
      }
      return next;
    });
  }
  const merged = useMemo(
    () => (nudges.size === 0 ? people : people.map((p) => (nudges.has(p.id) ? { ...p, pos_x: nudges.get(p.id)!, pos_y: null } : p))),
    [people, nudges],
  );
  const model = useMemo(() => buildFamilyModel(merged, relationships), [merged, relationships]);
  const graph = useMemo(() => buildGraphElements(merged, relationships, lang), [merged, relationships, lang]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(graph.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges as unknown as Edge[]);
  const selectedRef = useRef<string | null>(null);
  // Re-sync only when the data (or a nudge) actually changes, never on a pending flag.
  useEffect(() => {
    setNodes((graph.nodes as unknown as Node[]).map((n) => (n.id === selectedRef.current ? { ...n, selected: true } : n)));
    setEdges(graph.edges as unknown as Edge[]);
  }, [graph, setNodes, setEdges]);
  const highlightIndex = useMemo(() => buildHighlightIndex(highlight), [highlight]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hub, setHub] = useState<{ personId: string; slot: RelativeSlot | null; nonce: number } | null>(null);
  const [tidyConfirm, setTidyConfirm] = useState(false);
  const focusHubOnOpen = useRef(false);

  // ── Family view ────────────────────────────────────────────────────────────
  const canToggle = !readOnly;
  const [view, setView] = useState<View>(() => (canToggle && searchParams.get("view") === "family" ? "family" : "tree"));
  const [familyId, setFamilyId] = useState<string | null>(() => {
    const id = focusId ?? searchParams.get("focus");
    return id && peopleById.has(id) ? id : defaultFamilyFocus(people, meId);
  });
  const [trail, setTrail] = useState<string[]>(() => (familyId ? [familyId] : []));
  const visitFamily = useCallback((id: string) => {
    setFamilyId(id);
    setTrail((tr) => (tr.includes(id) ? tr.slice(0, tr.indexOf(id) + 1) : [...tr, id].slice(-8)));
  }, []);

  // Keep the address shareable while in Family view (`/?view=family&focus=<id>`).
  useEffect(() => {
    if (!canToggle) return;
    const url = new URL(window.location.href);
    if (view === "family" && familyId) {
      url.searchParams.set("view", "family");
      url.searchParams.set("focus", familyId);
    } else {
      url.searchParams.delete("view");
      url.searchParams.delete("focus");
    }
    const next = url.pathname + (url.search ? url.search : "");
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", next);
  }, [view, familyId, canToggle]);

  // ── Viewport ───────────────────────────────────────────────────────────────
  const userMoved = useRef(false);
  const onMoveStart: OnMoveStart = useCallback((event) => {
    if (event) userMoved.current = true; // programmatic moves have no event
  }, []);
  const fitAll = useCallback((duration = 300) => {
    fitView({ ...FIT_ALL, duration });
  }, [fitView]);

  // Keyboard: arrows (or WASD) move around, + / − zoom, 0 or F fits the whole tree.
  // Ignored while typing, on buttons, and inside dialogs or the family panel's fields.
  useEffect(() => {
    if (view !== "tree") return;
    const STEP = 120;
    const pan: Record<string, [number, number]> = {
      arrowleft: [STEP, 0], a: [STEP, 0], arrowright: [-STEP, 0], d: [-STEP, 0],
      arrowup: [0, STEP], w: [0, STEP], arrowdown: [0, -STEP], s: [0, -STEP],
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.closest('[role="dialog"]'))) return;
      const k = e.key.toLowerCase();
      if (pan[k]) {
        const v = getViewport();
        setViewport({ x: v.x + pan[k][0], y: v.y + pan[k][1], zoom: v.zoom }, { duration: 120 });
        userMoved.current = true;
      } else if (k === "+" || k === "=") {
        zoomIn({ duration: 150 });
        userMoved.current = true;
      } else if (k === "-" || k === "_") {
        zoomOut({ duration: 150 });
        userMoved.current = true;
      } else if (k === "0" || k === "f") {
        fitAll(300);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, getViewport, setViewport, zoomIn, zoomOut, fitAll]);

  /** Centre a person, leaving room for the desktop family panel beside them. */
  const centreOn = useCallback(
    (id: string, panelWillOpen: boolean) => {
      const n = (nodes as unknown as GraphNode[]).find((x) => x.id === id);
      if (!n) return;
      const zoom = Math.max(getZoom(), FOCUS_ZOOM);
      const shift = panelWillOpen && desktop ? PANEL_W / 2 / zoom : 0;
      const dir = lang === "ar" ? -1 : 1;
      setCenter(n.position.x + NODE_WIDTH / 2 + dir * shift, n.position.y + NODE_HEIGHT / 2, { zoom, duration: 500 });
    },
    [nodes, getZoom, setCenter, desktop, lang],
  );

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      selectedRef.current = id;
      setNodes((ns) => ns.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })));
      setHub(id && !readOnly ? { personId: id, slot: null, nonce: Date.now() } : null);
    },
    [readOnly, setNodes],
  );

  const focusOn = useCallback(
    (id: string) => {
      if (!peopleById.has(id)) return false;
      if (view === "family") {
        visitFamily(id);
        return true;
      }
      centreOn(id, !readOnly);
      if (!readOnly) select(id);
      return true;
    },
    [peopleById, view, visitFamily, centreOn, readOnly, select],
  );

  // First frame, once cards have been measured: the explicit intent, else fit everything.
  const framed = useRef(false);
  const highlightKey = highlight?.nodeIds.join(",") ?? "";
  useEffect(() => {
    if (!nodesReady) return;
    const intent = resolveViewportIntent({
      nodeIds: people.map((p) => p.id),
      pathIds: highlightKey ? highlightKey.split(",") : null,
      focusId: framed.current ? null : focusId,
    });
    if (intent.kind === "path") fitView({ nodes: intent.ids.map((id) => ({ id })), padding: 0.3, duration: 500, maxZoom: 1.1 });
    else if (framed.current) return;
    else if (intent.kind === "node") focusOn(intent.id);
    else fitAll(0);
    framed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frame once when measured, and again only when the path changes
  }, [nodesReady, highlightKey]);

  // Re-fit when the window changes size, until the person moves the view themselves.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!userMoved.current && !highlightKey && view === "tree") fitAll(200);
      }, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [fitAll, highlightKey, view]);

  // After "Tidy up" the server sends new positions; fit them once they land.
  const refitAfterTidy = useRef(false);
  useEffect(() => {
    if (!refitAfterTidy.current || tidying) return;
    refitAfterTidy.current = false;
    userMoved.current = false;
    const timer = setTimeout(() => fitAll(400), 50);
    return () => clearTimeout(timer);
  }, [graph, tidying, fitAll]);

  // `?focus=` (Full tree) is one-shot: drop it once handled so refresh/back doesn't jump again.
  useEffect(() => {
    if (!focusId || view === "family") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("focus")) return;
    url.searchParams.delete("focus");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, [focusId]);

  // The top-bar search asks a mounted canvas to focus someone.
  useEffect(() => shell.onFocusRequest((id) => void focusOn(id)), [focusOn]);

  // Tell the Add menu who is selected ("Adding to Mariam").
  const contextId = view === "family" ? familyId : selectedId;
  useEffect(() => {
    if (readOnly) return;
    const p = contextId ? peopleById.get(contextId) : null;
    shell.setCanvasPerson(p ? { id: p.id, slug: p.slug, name: getDisplayName(p, lang) } : null);
  }, [contextId, peopleById, readOnly, lang]);
  useEffect(() => () => shell.setCanvasPerson(null), []);

  function changeView(next: View) {
    if (next === view) return;
    setView(next);
    setHub(null);
    if (next === "family") {
      if (selectedId) visitFamily(selectedId);
    } else {
      setTimeout(() => (familyId && selectedId === familyId ? centreOn(familyId, false) : fitAll(300)), 0);
    }
  }

  // ── Nodes and edges for display ───────────────────────────────────────────
  const displayEdges = useMemo(
    () => (highlightIndex ? (edges as unknown as GraphEdge[]).map((e) => applyEdgeHighlight(e, highlightIndex)) : edges),
    [edges, highlightIndex],
  );

  const slotsFor = useCallback(
    (id: string): SlotKind[] => {
      const p = peopleById.get(id);
      if (!p || p.is_placeholder) return [];
      const out: SlotKind[] = [];
      if (!p.father_id) out.push("father");
      if (!p.mother_id) out.push("mother");
      const married = relationships.some((r) => r.type === "spouse" && r.status === "current" && (r.person_a_id === id || r.person_b_id === id));
      if (!married) out.push("partner");
      out.push("child");
      return out;
    },
    [peopleById, relationships],
  );

  const openSlot = useCallback((personId: string, slot: SlotKind) => {
    focusHubOnOpen.current = true;
    setHub({ personId, slot, nonce: Date.now() });
  }, []);

  const nodesWithCallbacks = useMemo(
    () =>
      (nodes as unknown as GraphNode[]).map((n) => {
        const personId = n.data.refOf ?? n.id;
        const isRef = n.type === "personRef";
        const showSlots = canEdit && !highlightIndex && !isRef && n.id === selectedId;
        return {
          ...n,
          selectable: !isRef,
          data: {
            ...n.data,
            readOnly,
            highlight: highlightIndex ? nodeHighlight(highlightIndex, personId) : undefined,
            slots: showSlots ? slotsFor(n.id) : undefined,
            onSlot: showSlots ? (slot: SlotKind) => openSlot(n.id, slot) : undefined,
            onOpenOriginal: isRef ? (id: string) => focusOn(id) : undefined,
          },
        };
      }),
    [nodes, readOnly, highlightIndex, canEdit, selectedId, slotsFor, openSlot, focusOn],
  );

  const moved = useMemo(() => (isAdmin ? merged.filter((p) => manualOffset(p) != null).length : 0), [merged, isAdmin]);

  // Dragging is sideways only (cards keep their generation row) and a couple
  // moves together, so a partner can never be left behind or interleaved.
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      const extra: NodeChange<Node>[] = [];
      const ids = new Set(changes.map((c) => ("id" in c ? c.id : "")));
      const locked = changes.map((c) => {
        if (c.type !== "position" || !c.position) return c;
        const cur = nodeById.get(c.id);
        if (!cur) return c;
        const position = { x: c.position.x, y: cur.position.y };
        const dx = position.x - cur.position.x;
        if (c.dragging && dx !== 0) {
          for (const mate of clusterMates(c.id, model)) {
            const mn = nodeById.get(mate);
            if (mn && !ids.has(mate)) extra.push({ type: "position", id: mate, position: { x: mn.position.x + dx, y: mn.position.y } });
          }
        }
        return { ...c, position };
      });
      onNodesChange([...locked, ...extra]);
    },
    [nodeById, model, onNodesChange],
  );

  const onNodeDragStop: OnNodeDrag = (_, node) => {
    if (!canEdit || node.type === "personRef") return;
    const nudge = nudgeFor(node.id, node.position.x, merged, relationships, model);
    if (!nudge) return;
    const before = nudges.get(nudge.personId);
    // Show the result straight away (snapped to the row, neighbours pushed clear) …
    setNudges((prev) => new Map(prev).set(nudge.personId, nudge.offset));
    startTransition(async () => {
      const r = await saveCardOffset(nudge.personId, nudge.offset);
      if (r.success) {
        router.refresh();
        return;
      }
      // … and put it back if it couldn't be saved.
      setNudges((prev) => {
        const next = new Map(prev);
        if (before == null) next.delete(nudge.personId);
        else next.set(nudge.personId, before);
        return next;
      });
      toast.error(t("Couldn't save the new position", "تعذّر حفظ الموضع الجديد"));
    });
  };

  const onNodeClick: NodeMouseHandler = (e, node) => {
    if (node.type === "personRef") return;
    const person = peopleById.get(node.id);
    if (!person) return;
    if (readOnly && !isGuest) {
      toast(getDisplayName(person, lang), {
        action: { label: t("Open profile", "فتح الملف"), onClick: () => router.push(`/person/${person.slug ?? person.id}`) },
      });
      return;
    }
    if (readOnly) {
      const name = getDisplayName(person, lang);
      toast(t(`Sign in to see ${name}'s details`, `سجّل الدخول لعرض تفاصيل ${name}`), {
        action: { label: t("Sign in", "تسجيل الدخول"), onClick: () => router.push("/login") },
      });
      return;
    }
    // Keyboard activation (Enter/Space on the card) moves focus into the panel.
    focusHubOnOpen.current = e.detail === 0;
    select(node.id);
  };

  // Move focus into the panel when it was opened from the keyboard or a "+ Add" slot.
  useEffect(() => {
    if (!hub || !focusHubOnOpen.current || !desktop) return;
    focusHubOnOpen.current = false;
    const timer = setTimeout(() => {
      const panel = document.querySelector<HTMLElement>("[aria-labelledby='family-hub-title']");
      // The add flow focuses its own heading; otherwise land on the panel title.
      if (panel && !panel.contains(document.activeElement)) panel.querySelector<HTMLElement>("#family-hub-title")?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [hub, desktop]);

  function closeHub() {
    const id = hub?.personId;
    setHub(null);
    if (view === "tree") {
      select(null);
      // Return focus to the card the panel was about.
      if (id) setTimeout(() => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"] button`)?.focus(), 0);
    }
  }

  function runTidy() {
    setTidyConfirm(false);
    startTidy(async () => {
      const r = await autoLayoutAll();
      if (!r.success) {
        toast.error(lang === "ar" ? "تعذّر ترتيب الشجرة." : r.error ?? "Couldn't tidy up the tree.");
        return;
      }
      toast.success(t("The tree is tidy.", "تم ترتيب الشجرة."));
      refitAfterTidy.current = true;
      setNudges(new Map());
      router.refresh();
    });
  }

  const meOnTree = !!meId && peopleById.has(meId);
  const hubPerson = hub ? peopleById.get(hub.personId) ?? null : null;

  return (
    <div className="relative h-full w-full">
      <div className={cn("h-full w-full", view === "family" && "invisible")} aria-hidden={view === "family" || undefined}>
        <FamilyGraph
          nodes={nodesWithCallbacks}
          edges={displayEdges as GraphEdge[]}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={() => hub && view === "tree" && closeHub()}
          onMoveStart={onMoveStart}
          panOnDrag
          nodesDraggable={canEdit}
        >
          {view === "tree" && <RowLabels nodes={nodes as unknown as GraphNode[]} lang={lang} />}
        </FamilyGraph>

        {canEdit && view === "tree" && (
          <EditTools lang={lang} onTidy={() => setTidyConfirm(true)} canTidy={isAdmin} moved={moved} busy={tidying} besidePanel={!!hub && desktop} />
        )}

        <ViewControls
          besidePanel={!!hub && desktop}
          lang={lang}
          onZoomOut={() => zoomOut({ duration: 200 })}
          onZoomIn={() => zoomIn({ duration: 200 })}
          onFit={() => fitAll(400)}
          onFocusPath={highlightIndex ? () => fitView({ nodes: highlight!.nodeIds.map((id) => ({ id })), padding: 0.3, duration: 500, maxZoom: 1.1 }) : undefined}
          onCenterMe={meOnTree ? () => {
            const intent = resolveViewportIntent({ nodeIds: peopleById.keys(), centerOnMeId: meId });
            if (intent.kind === "node") focusOn(intent.id);
          } : undefined}
        />

        <CanvasOverlay lang={lang} readOnly={readOnly} canEdit={canEdit} pathLegend={!!highlightIndex} />
      </div>

      {view === "family" && familyId && (
        <div className="absolute inset-0 z-20">
          <FamilyView
            focusId={familyId}
            trail={trail}
            people={people}
            relationships={relationships}
            lang={lang}
            canEdit={canEdit}
            meId={meId}
            onFocus={visitFamily}
            onOpenHub={(slot) => {
              focusHubOnOpen.current = !!slot;
              setHub({ personId: familyId, slot, nonce: Date.now() });
            }}
            onShowOnTree={(id) => {
              setView("tree");
              setTimeout(() => {
                centreOn(id, true);
                select(id);
              }, 0);
            }}
          />
        </div>
      )}

      {canToggle && <ViewToggle lang={lang} view={view} onChange={changeView} />}

      {!readOnly && (
        <FamilyHub
          person={hubPerson}
          slot={hub?.slot ?? null}
          slotNonce={hub?.nonce ?? 0}
          people={people}
          relationships={relationships}
          lang={lang}
          canEdit={canEdit}
          meId={meId}
          onClose={closeHub}
          onShowPerson={(id) => {
            if (view === "family") {
              visitFamily(id);
              setHub(null);
            } else focusOn(id);
          }}
        />
      )}

      <Dialog open={tidyConfirm} onOpenChange={setTidyConfirm}>
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle>{t("Tidy up the whole tree?", "ترتيب الشجرة كاملة؟")}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {t(
                "Everyone's card is rearranged automatically: couples side by side, each marriage's children grouped under it. Positions set by hand are replaced for everyone.",
                "ستُرتَّب البطاقات تلقائيًا: كل زوجين متجاوران، وأبناء كل زواج تحته. تُستبدل المواضع التي رُتّبت يدويًا لدى الجميع.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setTidyConfirm(false)}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {t("Cancel", "إلغاء")}
            </button>
            <button
              type="button"
              onClick={runTidy}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-4 text-sm font-bold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              {t("Tidy up", "ترتيب")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
