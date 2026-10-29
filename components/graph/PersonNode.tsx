"use client";

import { Handle, Position, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn, getDisplayName, getNameParts } from "@/lib/utils";
import { DIM_OPACITY, type NodeHighlight } from "@/lib/graph/highlight";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/node-size";
import { COMPACT_ZOOM } from "@/lib/graph/viewport";
import { avatarTone, initialsOf, lifeYears } from "@/lib/people/display";
import { useIsCurrentPerson } from "@/components/providers/current-person-provider";
import type { PersonInput, PersonNodeData, SlotKind } from "@/lib/graph/transform";

type PersonNodeType = Node<PersonNodeData, "person" | "personRef">;

// Lines attach to these; they are never shown and never draggable.
const HIDDEN_HANDLE: React.CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0, pointerEvents: "none" };

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Left} id="left" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="target" position={Position.Left} id="left-target" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Right} id="right" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="target" position={Position.Right} id="right-target" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={false} style={HIDDEN_HANDLE} />
    </>
  );
}

/** Orange ring around people on the highlighted relationship path. */
function pathRing(h: NodeHighlight | undefined): string | undefined {
  if (h?.state !== "on") return undefined;
  return h.step != null
    ? "0 0 0 3px var(--path), 0 0 0 9px var(--path-soft)"
    : "0 0 0 2px var(--path), 0 0 0 7px var(--path-soft)";
}

/** Step number for people on the route; a small tag for shared ancestors off it. */
function PathMarker({ highlight, lang }: { highlight: NodeHighlight | undefined; lang: "ar" | "en" }) {
  if (highlight?.state !== "on") return null;
  if (highlight.step != null) {
    return (
      <span className="absolute -start-3 -top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--path)] text-sm font-bold text-white shadow-md ring-2 ring-white">
        <span className="sr-only">{lang === "ar" ? "الخطوة " : "Step "}</span>
        {highlight.step}
      </span>
    );
  }
  return (
    <span className="absolute start-3 -top-3 z-30 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[var(--path)] shadow-sm ring-1 ring-[var(--path)]">
      {lang === "ar" ? "جدّ مشترك" : "Shared ancestor"}
    </span>
  );
}

function Avatar({ person, lang, size = 52 }: { person: PersonInput; lang: "ar" | "en"; size?: number }) {
  const tone = avatarTone(person.id);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-bold"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg }}
      aria-hidden
    >
      {person.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- storage photo, rendered small on a transformed canvas
        <img src={person.photo_url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        initialsOf(person, lang)
      )}
    </span>
  );
}

/** Keyboard users tabbing through the tree: bring a card into view when it takes focus. */
function useRevealOnFocus(x: number, y: number) {
  const { getViewport, setCenter } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  return (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.matches(":focus-visible")) return;
    const { x: vx, y: vy, zoom } = getViewport();
    const left = x * zoom + vx;
    const top = y * zoom + vy;
    const inView = left >= 0 && top >= 0 && left + NODE_WIDTH * zoom <= width && top + NODE_HEIGHT * zoom <= height;
    if (!inView) setCenter(x + NODE_WIDTH / 2, y + NODE_HEIGHT / 2, { zoom, duration: 200 });
  };
}

const SLOT_LABEL: Record<SlotKind, { en: string; ar: string }> = {
  father: { en: "Add father", ar: "أضف الأب" },
  mother: { en: "Add mother", ar: "أضف الأم" },
  partner: { en: "Add partner", ar: "أضف شريك الحياة" },
  child: { en: "Add child", ar: "أضف ابنًا أو ابنة" },
  sibling: { en: "Add sibling", ar: "أضف أخًا أو أختًا" },
};

/** Dashed "+ Add …" placeholder: a real button that opens the family panel at that slot. */
export function SlotButton({ slot, lang, onClick, className }: { slot: SlotKind; lang: "ar" | "en"; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "nodrag nopan flex h-[60px] w-[136px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#C9B8B3] bg-[var(--background)] px-2 text-[13px] font-bold text-[var(--primary)] shadow-sm transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)]">
        <Plus className="h-4 w-4" />
      </span>
      {lang === "ar" ? SLOT_LABEL[slot].ar : SLOT_LABEL[slot].en}
    </button>
  );
}

function Slots({ slots, lang, onSlot }: { slots: SlotKind[]; lang: "ar" | "en"; onSlot?: (s: SlotKind) => void }) {
  const has = (s: SlotKind) => slots.includes(s);
  const fire = (s: SlotKind) => () => onSlot?.(s);
  return (
    <>
      {(has("father") || has("mother")) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+22px)] z-40 flex justify-center gap-3 [&>*]:pointer-events-auto">
          {has("father") && <SlotButton slot="father" lang={lang} onClick={fire("father")} />}
          {has("mother") && <SlotButton slot="mother" lang={lang} onClick={fire("mother")} />}
        </div>
      )}
      {has("partner") && (
        <div className="absolute start-[calc(100%+18px)] top-1/2 z-40 -translate-y-1/2">
          <SlotButton slot="partner" lang={lang} onClick={fire("partner")} />
        </div>
      )}
      {has("child") && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(100%+22px)] z-40 flex justify-center [&>*]:pointer-events-auto">
          <SlotButton slot="child" lang={lang} onClick={fire("child")} />
        </div>
      )}
    </>
  );
}

const CARD = "relative flex flex-col items-center justify-center gap-1 rounded-2xl border px-2.5 text-center transition-[opacity,box-shadow,border-color] duration-300 focus-visible:outline-none";

export function PersonNode({ data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<PersonNodeType>) {
  const { person, lang, highlight, slots } = data;
  const isMe = useIsCurrentPerson(person.id);
  const reveal = useRevealOnFocus(positionAbsoluteX, positionAbsoluteY);
  // Boolean selector: nodes re-render only when the zoom crosses the threshold, not on every pan.
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);
  const dimmed = highlight?.state === "dim";
  const ring = pathRing(highlight);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  if (person.is_placeholder) {
    return (
      <>
        <Handles />
        <button
          type="button"
          aria-pressed={selected}
          aria-label={t("Unknown parent", "والد غير معروف")}
          onFocus={reveal}
          style={{ width: NODE_WIDTH, height: NODE_HEIGHT, opacity: dimmed ? DIM_OPACITY : 1, boxShadow: ring }}
          className={cn(CARD, "border-2 border-dashed bg-[var(--background)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]", selected ? "border-[var(--primary)]" : "border-[var(--border-strong)]")}
        >
          <PathMarker highlight={highlight} lang={lang} />
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-[var(--border-strong)] text-lg text-[var(--muted-foreground)]">
            ?
          </span>
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">{t("Unknown parent", "والد غير معروف")}</span>
        </button>
        {selected && slots && slots.length > 0 && <Slots slots={slots} lang={lang} onSlot={data.onSlot} />}
      </>
    );
  }

  const { given, family } = getNameParts(person, lang);
  const givenName = given || t("Unnamed", "بدون اسم");
  const fullName = getDisplayName(person, lang);
  const years = lifeYears(person.birth_date, person.death_date, lang);

  // Zoomed far out (a big tree fit to the screen): initials and name only, set
  // large enough to stay legible after scaling. Same card size, so layout holds.
  if (compact) {
    const isRef = !!data.refOf;
    return (
      <>
        <Handles />
        <button
          type="button"
          onClick={isRef ? (e) => { e.stopPropagation(); data.onOpenOriginal?.(person.id); } : undefined}
          aria-pressed={isRef || data.readOnly ? undefined : selected}
          aria-label={isRef ? t(`${fullName}: also elsewhere in the tree. Go to their card`, `${fullName}: موجود أيضًا في مكان آخر. انتقل إلى بطاقته`) : [fullName, years, isMe ? t("you", "أنت") : ""].filter(Boolean).join(", ")}
          onFocus={reveal}
          style={{
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            opacity: dimmed ? DIM_OPACITY : 1,
            boxShadow: ring ?? (selected || isMe ? "0 0 0 4px var(--primary)" : undefined),
          }}
          className={cn(
            CARD,
            "gap-2 focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
            isRef ? "nodrag border-[3px] border-dashed border-[#B5A6A8] bg-[var(--background)]" : "border-2 bg-[var(--card)]",
            !isRef && (selected || isMe ? "border-[var(--primary)]" : "border-[var(--border-strong)]"),
          )}
        >
          <Avatar person={person} lang={lang} size={60} />
          <span className="line-clamp-2 w-full text-[24px] font-bold leading-[1.1] text-[var(--foreground)]">
            {isRef && <span aria-hidden>↗ </span>}
            {givenName}
          </span>
        </button>
      </>
    );
  }

  if (data.refOf) {
    const branch = family
      ? t(`Also in the ${family} branch`, `أيضًا في فرع ${family}`)
      : t("Also elsewhere in the tree", "موجود أيضًا في مكان آخر من الشجرة");
    return (
      <>
        <Handles />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onOpenOriginal?.(person.id);
          }}
          onFocus={reveal}
          aria-label={t(`${fullName}: ${branch}. Go to their card`, `${fullName}: ${branch}. انتقل إلى بطاقته`)}
          style={{ width: NODE_WIDTH, height: NODE_HEIGHT, opacity: dimmed ? DIM_OPACITY : 1, boxShadow: ring }}
          className={cn(CARD, "nodrag cursor-pointer border-2 border-dashed border-[#B5A6A8] bg-[var(--background)] hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]")}
        >
          <PathMarker highlight={highlight} lang={lang} />
          <Avatar person={person} lang={lang} size={44} />
          <span className="w-full truncate text-[14px] font-semibold leading-5 text-[var(--foreground)]">{givenName}</span>
          <span className="line-clamp-2 text-[11.5px] font-semibold leading-tight text-[var(--primary)]">
            <span aria-hidden>↗ </span>
            {branch}
          </span>
        </button>
      </>
    );
  }

  const shadow = ring
    ? ring
    : selected
      ? "0 0 0 2px var(--primary), 0 0 0 6px var(--primary-soft), 0 10px 28px rgba(122,22,49,0.15)"
      : isMe
        ? "0 0 0 2px var(--primary), 0 4px 14px rgba(36,21,23,0.08)"
        : "0 4px 14px rgba(36,21,23,0.08)";

  const label = [fullName, years, isMe ? t("you", "أنت") : ""].filter(Boolean).join(", ");

  return (
    <>
      <Handles />
      <button
        type="button"
        aria-pressed={data.readOnly ? undefined : selected}
        aria-label={label}
        onFocus={reveal}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT, opacity: dimmed ? DIM_OPACITY : 1, boxShadow: shadow }}
        className={cn(
          CARD,
          "cursor-pointer bg-[var(--card)] hover:shadow-[0_8px_24px_rgba(36,21,23,0.12)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          selected || isMe ? "border-[var(--primary)]" : "border-[var(--border)]",
        )}
      >
        <PathMarker highlight={highlight} lang={lang} />
        {isMe && !highlight && (
          <span aria-hidden className="absolute -top-2.5 end-3 z-20 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-foreground)]">
            {t("You", "أنت")}
          </span>
        )}
        <Avatar person={person} lang={lang} />
        <span className="mt-1 w-full truncate text-[15px] font-semibold leading-5 text-[var(--foreground)]" title={fullName}>
          {givenName}
        </span>
        <span className="h-4 w-full truncate text-xs leading-4 text-[var(--muted-foreground)]">{years}</span>
      </button>
      {selected && slots && slots.length > 0 && <Slots slots={slots} lang={lang} onSlot={data.onSlot} />}
    </>
  );
}
