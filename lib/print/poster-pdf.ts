/**
 * Builds the printable family tree PDF, in the browser, from the same layout
 * and the same vines as the canvas. Lines, leaves and cards stay vector, so they
 * are sharp at any size. Photos are embedded at print resolution. Names are
 * drawn by the browser's own text engine and embedded at high resolution, which
 * is what makes Arabic join correctly and lets any script print in the site's
 * fonts. Load this module on demand: it pulls in the PDF library.
 */

import {
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { EDGE_STYLES, GHOST_OPACITY, WIDOWED_GLYPH } from "@/lib/graph/edge-styles";
import { marriageLabel } from "@/lib/graph/family-view";
import { coupleLine, type Rect } from "@/lib/graph/geometry";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/node-size";
import { buildGraphElements, type GraphEdge, type GraphNode, type PersonInput, type RelationshipInput } from "@/lib/graph/transform";
import { BARK, LEAF_TONES, VEIN, VEIN_WIDTH, coupleVine, familyVineFromCards, linkVine, sprigVine, type VineArt } from "@/lib/graph/vines";
import { countGenerations } from "@/lib/people/stats";
import { avatarTone, initialsOf, lifeYears } from "@/lib/people/display";
import { PHOTO_SIZES } from "@/lib/storage/sign";
import { getNameParts } from "@/lib/utils";
import { NAME_UNITS, absolutePositions, fitPoster, posterCards, rowCount, treeBounds, type PaperId, type PosterFit } from "./poster-layout";

type Lang = "ar" | "en";

export type PosterProgress = { stage: "photos" | "cards" | "saving"; done: number; total: number };

export type PosterInput = {
  people: PersonInput[];
  relationships: RelationshipInput[];
  lang: Lang;
  paper: PaperId;
  /** Today's date, already worded for the reader. */
  printedOn: string;
  onProgress?: (p: PosterProgress) => void;
  /** Stop early (the reader closed the dialog). */
  cancelled?: () => boolean;
};

export type PosterResult = { bytes: Uint8Array; missingPhotos: number };

export class PosterCancelled extends Error {}

// ── Card design, in canvas units. Sizes grow with the sheet's card zoom. ─────
const CARD_RADIUS = 16;
const LABEL_W = NODE_WIDTH - 12;
const INK = "#241517";
const MUTED = "#6B5B5E";
const PRIMARY = "#7A1631";

/** Below this, zooming in on screen turns names to mush, whatever the paper size. */
const MIN_PX_PER_UNIT = 3.2;
const MAX_PX_PER_UNIT = 10;
const PRINT_DPI = 300;
const MIN_PHOTO_PX = 192;
const PHOTO_WORKERS = 6;
const PHOTO_TIMEOUT_MS = 20_000;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));
const canvasPng = (c: HTMLCanvasElement) =>
  new Promise<ArrayBuffer>((resolve, reject) => c.toBlob((b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("canvas"))), "image/png"));

type Line = { text: string; size: number; weight: number; color: string; display?: boolean; wrap?: boolean };

/** Reads the site's font stacks, and waits until the faces these words need have loaded. */
async function prepareFonts(texts: string[]): Promise<{ sans: string; display: string }> {
  const css = getComputedStyle(document.documentElement);
  const arabic = css.getPropertyValue("--font-arabic").trim();
  const stack = (name: string) => [css.getPropertyValue(name).trim(), arabic, "system-ui", "sans-serif"].filter(Boolean).join(", ");
  const sans = stack("--font-sans");
  const display = stack("--font-display");
  const sample = texts.join(" ").slice(0, 20_000);
  await Promise.allSettled([
    document.fonts.load(`700 20px ${sans}`, sample),
    document.fonts.load(`500 20px ${sans}`, sample),
    document.fonts.load(`700 20px ${display}`, sample),
  ]);
  await document.fonts.ready;
  return { sans, display };
}

/** Shrink a line to fit its width. A name always prints in full; only other words may lose their end. */
function fitLine(ctx: CanvasRenderingContext2D, line: Line, family: string, maxWidth: number): { text: string; font: string } {
  let size = line.size;
  const fontAt = (s: number) => `${line.weight} ${s}px ${family}`;
  ctx.font = fontAt(size);
  const width = ctx.measureText(line.text).width;
  if (width > maxWidth) {
    size = line.wrap ? (size * maxWidth) / width : Math.max(line.size * 0.58, (size * maxWidth) / width);
    ctx.font = fontAt(size);
  }
  if (line.wrap) return { text: line.text, font: ctx.font };
  let text = line.text;
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) {
    text = `${Array.from(text).slice(0, -2).join("")}…`;
  }
  return { text, font: ctx.font };
}

/** A long name takes two lines, split between words as evenly as it can be. */
function wrapLine(ctx: CanvasRenderingContext2D, line: Line, family: string, pxPerU: number, maxWidth: number): Line[] {
  const words = line.text.trim().split(/\s+/);
  if (!line.wrap || words.length < 2) return [line];
  ctx.font = `${line.weight} ${line.size * pxPerU}px ${family}`;
  if (ctx.measureText(line.text).width <= maxWidth) return [line];
  let best = 1;
  let bestWidest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const widest = Math.max(ctx.measureText(words.slice(0, i).join(" ")).width, ctx.measureText(words.slice(i).join(" ")).width);
    if (widest < bestWidest) {
      bestWidest = widest;
      best = i;
    }
  }
  const size = line.size * 0.8;
  return [
    { ...line, text: words.slice(0, best).join(" "), size },
    { ...line, text: words.slice(best).join(" "), size },
  ];
}

/** A transparent PNG holding lines of text, centred, in the reader's direction. */
function textImage(lines: Line[], widthU: number, heightU: number, pxPerU: number, fonts: { sans: string; display: string }, lang: Lang) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(widthU * pxPerU));
  canvas.height = Math.max(1, Math.ceil(heightU * pxPerU));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.direction = lang === "ar" ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const gap = 1.22;
  const wrapped = lines.flatMap((line) => wrapLine(ctx, line, line.display ? fonts.display : fonts.sans, pxPerU, widthU * pxPerU * 0.98));
  // A wrapped name can need more room than the card has: everything steps down together.
  const needed = wrapped.reduce((sum, l) => sum + l.size * gap, 0);
  const fitHeight = Math.min(1, heightU / needed);
  const laidOut = wrapped.map((l) => ({ ...l, size: l.size * fitHeight }));
  const total = needed * fitHeight;
  let y = (heightU - total) / 2;
  for (const line of laidOut) {
    const fitted = fitLine(ctx, { ...line, size: line.size * pxPerU }, line.display ? fonts.display : fonts.sans, widthU * pxPerU * 0.98);
    ctx.font = fitted.font;
    ctx.fillStyle = line.color;
    ctx.fillText(fitted.text, (widthU * pxPerU) / 2, (y + (line.size * gap) / 2) * pxPerU);
    y += line.size * gap;
  }
  return canvasPng(canvas);
}

/** A person's photo as a square JPEG at print resolution, or null if it can't be read. */
async function photoJpeg(url: string, targetPx: number): Promise<ArrayBuffer | null> {
  try {
    let src = url;
    if (url.startsWith("/api/photo")) {
      const u = new URL(url, window.location.origin);
      const width = PHOTO_SIZES.find((s) => s >= targetPx) ?? PHOTO_SIZES[PHOTO_SIZES.length - 1];
      u.searchParams.set("w", String(width));
      src = `${u.pathname}${u.search}`;
    }
    const res = await fetch(src, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const side = Math.min(bitmap.width, bitmap.height);
    if (side === 0) return null;
    const size = Math.min(targetPx, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    // Same crop as the cards on the tree: the centre of the picture.
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Draws in canvas units; the page's y-axis runs the other way, which drawSvgPath handles. */
function canvasPen(page: PDFPage, x: number, top: number, scale: number) {
  const y = page.getHeight() - top;
  return {
    fill(d: string, color: string) {
      if (d) page.drawSvgPath(d, { x, y, scale, color: hex(color), borderWidth: 0 });
    },
    stroke(d: string, color: string, width: number, dash?: string, opacity = 1) {
      if (!d) return;
      page.drawSvgPath(d, {
        x,
        y,
        scale,
        borderColor: hex(color),
        borderWidth: width,
        borderOpacity: opacity,
        borderDashArray: dash ? dash.split(" ").map(Number) : undefined,
      });
    },
    art(art: VineArt) {
      art.leaves.forEach((d, i) => this.fill(d, LEAF_TONES[i]));
      this.stroke(art.veins, VEIN, VEIN_WIDTH);
      this.fill(art.stems, BARK);
    },
  };
}

/** Path of a rounded rectangle, in canvas units. */
function roundedPath(x: number, y: number, w: number, h: number, c: number): string {
  return `M ${x + c} ${y} H ${x + w - c} Q ${x + w} ${y} ${x + w} ${y + c} V ${y + h - c} Q ${x + w} ${y + h} ${x + w - c} ${y + h} H ${x + c} Q ${x} ${y + h} ${x} ${y + h - c} V ${y + c} Q ${x} ${y} ${x + c} ${y} Z`;
}

/** Path of a circle, in canvas units. */
function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
}

/** A round-cropped photo, in page points measured from the bottom-left. */
function drawRoundImage(page: PDFPage, image: PDFImage, cx: number, cy: number, r: number) {
  const k = r * 0.5523;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(cx - r, cy),
    appendBezierCurve(cx - r, cy + k, cx - k, cy + r, cx, cy + r),
    appendBezierCurve(cx + k, cy + r, cx + r, cy + k, cx + r, cy),
    appendBezierCurve(cx + r, cy - k, cx + k, cy - r, cx, cy - r),
    appendBezierCurve(cx - k, cy - r, cx - r, cy - k, cx - r, cy),
    closePath(),
    clip(),
    endPath(),
  );
  page.drawImage(image, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  page.pushOperators(popGraphicsState());
}

/** The words on one card, sized for this sheet. */
function cardLines(node: GraphNode, lang: Lang, zoom: number): Line[] {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const { person } = node.data;
  if (person.is_placeholder) {
    return [{ text: t("Unknown parent", "والد غير معروف"), size: 15 * zoom, weight: 700, color: MUTED, wrap: true }];
  }
  const { given, family } = getNameParts(person, lang);
  const name: Line = { text: given || t("Unnamed", "بدون اسم"), size: NAME_UNITS * zoom, weight: 700, color: INK, wrap: true };
  const lines: Line[] = [name];
  if (node.data.refOf) {
    lines.push({
      text: family ? t(`Also in the ${family} branch`, `أيضًا في فرع ${family}`) : t("Also elsewhere in the tree", "موجود أيضًا في مكان آخر من الشجرة"),
      size: 12 * zoom,
      weight: 500,
      color: PRIMARY,
    });
    return lines;
  }
  if (family) lines.push({ text: family, size: 14.5 * zoom, weight: 500, color: INK });
  const years = lifeYears(person.birth_date, person.death_date, lang);
  if (years) lines.push({ text: years, size: 12 * zoom, weight: 500, color: MUTED });
  return lines;
}

/** Vines, past-marriage lines and adoption links, in canvas order: behind the cards. */
function drawVines(pen: ReturnType<typeof canvasPen>, edges: GraphEdge[], at: Map<string, Rect>) {
  for (const e of edges) {
    const d = e.data;
    if (d?.edgeKind === "family-branch") {
      const [aId, bId] = d.partnerNodeIds ?? [null, null];
      const a = aId ? at.get(aId) : undefined;
      if (!a) continue;
      const kids = (d.childIds ?? []).filter((c) => at.has(c)).map((c) => ({ id: c, rect: at.get(c)!, width: NODE_WIDTH }));
      const vine = familyVineFromCards({ a, b: (bId && at.get(bId)) || null, lane: d.lane ?? 0 }, kids, e.id);
      if (vine) pen.art(vine.art);
    } else if (d?.edgeKind === "spouse") {
      const a = at.get(e.source);
      const b = at.get(e.target);
      if (!a || !b) continue;
      const status = d.status ?? "current";
      const twined = status === "current" && !d.implicit;
      const vine = coupleVine(a, b, d.lane ?? 0, e.id, twined);
      if (twined) {
        pen.art(vine.art);
      } else {
        const style = d.implicit ? { stroke: EDGE_STYLES.parentChild.stroke, dash: "1 5" } : status === "divorced" ? EDGE_STYLES.coupleDivorced : EDGE_STYLES.coupleWidowed;
        pen.stroke(vine.line, style.stroke, d.implicit ? 1.5 : 2, style.dash, status !== "current" ? GHOST_OPACITY + 0.15 : 1);
      }
    } else if (d?.edgeKind === "adopted" || d?.edgeKind === "guardian") {
      const from = at.get(e.source);
      const to = at.get(e.target);
      if (!from || !to) continue;
      const style = d.edgeKind === "adopted" ? EDGE_STYLES.adopted : EDGE_STYLES.guardian;
      pen.stroke(linkVine({ x: from.x + NODE_WIDTH / 2, y: from.y + (from.height ?? NODE_HEIGHT) }, { x: to.x + NODE_WIDTH / 2, y: to.y }, e.id), style.stroke, 2, style.dash);
    }
  }
}

/** Title and a line of facts, with a sprig of vine growing in from each side. */
async function drawTitle(doc: PDFDocument, page: PDFPage, fit: PosterFit, people: PersonInput[], input: PosterInput, fonts: { sans: string; display: string }) {
  const { lang } = input;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const real = people.filter((p) => !p.is_placeholder).length;
  const generations = countGenerations(people.filter((p) => !p.is_placeholder));
  const facts = lang === "ar"
    ? `${real === 1 ? "شخص واحد" : `${real} أشخاص`} · ${generations === 1 ? "جيل واحد" : `${generations} أجيال`} · ${input.printedOn}`
    : `${real} ${real === 1 ? "person" : "people"} · ${generations} ${generations === 1 ? "generation" : "generations"} · ${input.printedOn}`;
  const title = t("The Big Fat Family", "عائلة بيغ فات");

  const u = fit.headerHeight / 100; // Header is laid out on a 100-unit-tall grid.
  const pxPerU = Math.min(30, u * 4.2);
  const titleWidthU = 620;
  const png = await textImage(
    [
      { text: title, size: 56, weight: 700, color: PRIMARY, display: true },
      { text: facts, size: 20, weight: 500, color: MUTED },
    ],
    titleWidthU,
    92,
    pxPerU,
    fonts,
    lang,
  );
  const image = await doc.embedPng(png);
  const width = titleWidthU * u;
  page.drawImage(image, {
    x: (fit.pageWidth - width) / 2,
    y: fit.pageHeight - fit.margin - 92 * u,
    width,
    height: 92 * u,
  });

  // A real branch on each side, thickest at the margin, reaching in towards the title.
  const room = (fit.pageWidth - width) / 2 - fit.margin;
  const lengthU = Math.min(room / u, 560);
  if (lengthU > 80) {
    const pen = canvasPen(page, 0, fit.margin + 34 * u, u);
    const edgeU = fit.margin / u;
    const rightEdgeU = (fit.pageWidth - fit.margin) / u;
    pen.art(sprigVine({ x: edgeU, y: 0 }, { x: edgeU + lengthU, y: 0 }, "sprig-left"));
    pen.art(sprigVine({ x: rightEdgeU, y: 0 }, { x: rightEdgeU - lengthU, y: 0 }, "sprig-right"));
  }
}

/** Lets one failing photo fall back to initials rather than failing the whole poster. */
async function loadPhotos(doc: PDFDocument, urls: string[], targetPx: number, input: PosterInput) {
  const out = new Map<string, PDFImage>();
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < urls.length && !input.cancelled?.()) {
      const url = urls[next++];
      const jpeg = await photoJpeg(url, targetPx);
      if (jpeg) {
        try {
          out.set(url, await doc.embedJpg(jpeg));
        } catch {
          // Unreadable image: this card shows initials.
        }
      }
      done++;
      input.onProgress?.({ stage: "photos", done, total: urls.length });
    }
  };
  await Promise.all(Array.from({ length: PHOTO_WORKERS }, worker));
  return out;
}

export async function buildPosterPdf(input: PosterInput): Promise<PosterResult> {
  const { people, relationships, lang, paper } = input;
  const stopIfCancelled = () => {
    if (input.cancelled?.()) throw new PosterCancelled();
  };

  const { nodes, edges } = buildGraphElements(people, relationships, lang);
  const fit = fitPoster(treeBounds(nodes, edges), paper, rowCount(nodes));
  const at = posterCards(absolutePositions(nodes), fit);
  const zoom = fit.cardZoom;
  const avatarR = 29 * zoom;
  const avatarCy = 6 * zoom + avatarR;
  const labelTop = avatarCy + avatarR + 3 * zoom;
  const labelH = fit.cardHeight - labelTop - 3 * zoom;

  const doc = await PDFDocument.create();
  const title = lang === "ar" ? "شجرة عائلة بيغ فات" : "The Big Fat Family Tree";
  doc.setTitle(title);
  doc.setCreator("Big Fat Family Tree");
  doc.setProducer("Big Fat Family Tree");
  doc.setLanguage(lang);
  const page = doc.addPage([fit.pageWidth, fit.pageHeight]);
  const { scale, originX, originY } = fit;
  const pen = canvasPen(page, originX, originY, scale);
  const pageX = (x: number) => originX + x * scale;
  const pageY = (y: number) => fit.pageHeight - originY - y * scale;

  const cardsLines = new Map(nodes.map((n) => [n.id, cardLines(n, lang, zoom)]));
  const allText = [...cardsLines.values()].flat().map((l) => l.text);
  const fonts = await prepareFonts([...allText, "The Big Fat Family", "عائلة بيغ فات"]);
  stopIfCancelled();

  // Photos first: the slowest step, and the one that can partly fail.
  const photoUrls = [...new Set(nodes.flatMap((n) => (n.data.person.photo_url && !n.data.person.is_placeholder ? [n.data.person.photo_url] : [])))];
  const photoPx = Math.min(1024, Math.max(MIN_PHOTO_PX, Math.ceil(((avatarR * 2 * scale) / 72) * PRINT_DPI)));
  const photos = await loadPhotos(doc, photoUrls, photoPx, input);
  stopIfCancelled();

  await drawTitle(doc, page, fit, people, input, fonts);
  drawVines(pen, edges, at);

  const pxPerU = Math.min(MAX_PX_PER_UNIT, Math.max(MIN_PX_PER_UNIT, (scale / 72) * PRINT_DPI));

  // Cards.
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const rect = at.get(node.id);
    if (!rect) continue;
    const { person } = node.data;
    const quiet = person.is_placeholder || !!node.data.refOf;
    page.drawSvgPath(roundedPath(rect.x, rect.y, NODE_WIDTH, fit.cardHeight, CARD_RADIUS), {
      x: originX,
      y: fit.pageHeight - originY,
      scale,
      color: rgb(1, 1, 1),
      borderColor: hex(quiet ? "#B5A6A8" : "#D9CCC7"),
      borderWidth: quiet ? 1.6 : 1.2,
      borderDashArray: quiet ? [5, 4] : undefined,
    });

    const cx = rect.x + NODE_WIDTH / 2;
    const cy = rect.y + avatarCy;
    const photo = person.photo_url ? photos.get(person.photo_url) : undefined;
    if (photo && !person.is_placeholder) {
      drawRoundImage(page, photo, pageX(cx), pageY(cy), avatarR * scale);
    } else {
      const tone = avatarTone(person.id);
      const initials = person.is_placeholder ? "?" : initialsOf(person, lang);
      pen.fill(circlePath(cx, cy, avatarR), person.is_placeholder ? "#F3ECE8" : tone.bg);
      const png = await textImage([{ text: initials, size: 22 * zoom, weight: 700, color: person.is_placeholder ? MUTED : tone.fg }], avatarR * 2, avatarR * 2, pxPerU, fonts, lang);
      page.drawImage(await doc.embedPng(png), {
        x: pageX(cx - avatarR),
        y: pageY(cy + avatarR),
        width: avatarR * 2 * scale,
        height: avatarR * 2 * scale,
      });
    }

    const png = await textImage(cardsLines.get(node.id) ?? [], LABEL_W, labelH, pxPerU, fonts, lang);
    page.drawImage(await doc.embedPng(png), {
      x: pageX(rect.x + (NODE_WIDTH - LABEL_W) / 2),
      y: pageY(rect.y + labelTop + labelH),
      width: LABEL_W * scale,
      height: labelH * scale,
    });

    input.onProgress?.({ stage: "cards", done: i + 1, total: nodes.length });
    if (i % 6 === 0) {
      await breathe();
      stopIfCancelled();
    }
  }

  // Marriage labels: on top of everything, as on the canvas.
  for (const e of edges) {
    const d = e.data;
    if (d?.edgeKind !== "spouse") continue;
    const a = at.get(e.source);
    const b = at.get(e.target);
    if (!a || !b) continue;
    const status = d.status ?? "current";
    const label = !d.implicit && (d.showOrder || status !== "current") ? marriageLabel(d.showOrder ? d.ordinal : null, status, lang) : "";
    const text = label || (status === "widowed" ? WIDOWED_GLYPH : "");
    if (!text) continue;
    const style = status === "divorced" ? EDGE_STYLES.coupleDivorced : status === "widowed" ? EDGE_STYLES.coupleWidowed : EDGE_STYLES.coupleCurrent;
    const parts = text.split(" · ");
    const lineH = 14;
    // Just narrower than the gap between neighbouring partners, so it never covers a card.
    const boxW = 76;
    const boxH = parts.length * lineH + 4;
    const pos = coupleLine(a, b, d.lane ?? 0).label;
    const top = pos.placement === "below" ? pos.y - 8 : pos.y - boxH + 6;
    pen.fill(roundedPath(pos.x - boxW / 2, top, boxW, boxH, 5), "#FFFFFF");
    const color = status === "widowed" ? MUTED : style.stroke;
    const png = await textImage(parts.map((p) => ({ text: p, size: 11, weight: 700, color })), boxW, boxH, pxPerU, fonts, lang);
    page.drawImage(await doc.embedPng(png), { x: pageX(pos.x - boxW / 2), y: pageY(top + boxH), width: boxW * scale, height: boxH * scale });
  }
  stopIfCancelled();

  input.onProgress?.({ stage: "saving", done: 0, total: 1 });
  await breathe();
  const bytes = await doc.save();
  return { bytes, missingPhotos: photoUrls.filter((u) => !photos.has(u)).length };
}
