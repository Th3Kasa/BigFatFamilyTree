/**
 * Turns the tree's connecting lines into living vines: tapered bark stems that
 * wander a little, with leaves and small twigs growing off them. Pure and
 * deterministic (a line keeps its leaves between renders, because everything
 * random comes from a generator seeded with the line's own id), and it returns
 * plain SVG path strings, so the canvas and the printed PDF draw the same vines.
 */

import { coupleLine, soloAnchor, type Rect } from "./geometry";
import { NODE_HEIGHT } from "./node-size";

export type Pt = { x: number; y: number };

/** Filled and stroked shapes for one vine. Empty strings mean "nothing to draw". */
export type VineArt = {
  /** Bark: filled, tapered outlines (trunks, limbs, twigs, leaf stalks). */
  stems: string;
  /** Leaves, one path per green (see LEAF_TONES). */
  leaves: [string, string, string];
  /** The fine centre line of each leaf: a thin stroke. */
  veins: string;
};

/** Three greens and bark, all well above 3:1 against the white canvas. */
export const BARK = "#5B3A1E";
export const LEAF_TONES = ["#4C9A26", "#5FAE2F", "#3A8220"] as const;
export const VEIN = "#2C6A18";
export const VEIN_WIDTH = 0.6;

/** How strongly leaves hang towards the ground (0 = not at all). */
const DROOP = 0.55;

type Rng = () => number;

/** Small, fast, seedable generator (mulberry32) seeded from an FNV-1a hash of the id. */
function rngFor(seed: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
/** One decimal is finer than anyone can see, and big trees draw a lot of numbers. */
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Replace sharp corners with a soft curve of radius up to `r`. */
function roundCorners(points: Pt[], r: number): Pt[] {
  const pts = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 0.01);
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const ra = Math.min(r, dist(a, b) / 2);
    const rb = Math.min(r, dist(b, c) / 2);
    const from = { x: b.x + ((a.x - b.x) * ra) / dist(a, b), y: b.y + ((a.y - b.y) * ra) / dist(a, b) };
    const to = { x: b.x + ((c.x - b.x) * rb) / dist(b, c), y: b.y + ((c.y - b.y) * rb) / dist(b, c) };
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      const u = 1 - t;
      out.push({ x: u * u * from.x + 2 * u * t * b.x + t * t * to.x, y: u * u * from.y + 2 * u * t * b.y + t * t * to.y });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Evenly spaced points along a polyline, always keeping both ends. */
function resample(points: Pt[], step: number): Pt[] {
  if (points.length < 2) return points.slice();
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  if (length < 0.01) return [points[0], points[points.length - 1]];
  const n = Math.max(2, Math.ceil(length / step));
  const gap = length / n;
  const out: Pt[] = [points[0]];
  let seg = 1;
  let walked = 0;
  for (let i = 1; i < n; i++) {
    const want = gap * i;
    while (seg < points.length - 1 && walked + dist(points[seg - 1], points[seg]) < want) {
      walked += dist(points[seg - 1], points[seg]);
      seg++;
    }
    const len = dist(points[seg - 1], points[seg]) || 1;
    const t = (want - walked) / len;
    out.push({ x: points[seg - 1].x + (points[seg].x - points[seg - 1].x) * t, y: points[seg - 1].y + (points[seg].y - points[seg - 1].y) * t });
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Unit tangent at sample `i`. */
function tangent(s: Pt[], i: number): Pt {
  const a = s[Math.max(0, i - 1)];
  const b = s[Math.min(s.length - 1, i + 1)];
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/**
 * Let a line wander sideways. Whole waves only, so the offset is exactly zero
 * at both ends and at the middle: vines still meet the cards, and children
 * still hang from the middle of their parents' vine. With a generator the bends
 * are mixed into irregular ones, like wood; without one they stay perfectly
 * even, which is what lets two strands twine.
 */
function wander(samples: Pt[], amplitude: number, wavelength: number, flip = 1, r?: Rng): Pt[] {
  let length = 0;
  for (let i = 1; i < samples.length; i++) length += dist(samples[i - 1], samples[i]);
  const waves = Math.max(1, Math.round(length / wavelength));
  const second = r ? between(r, -0.55, 0.55) : 0;
  const third = r ? between(r, -0.3, 0.3) : 0;
  let walked = 0;
  return samples.map((p, i) => {
    if (i > 0) walked += dist(samples[i - 1], p);
    const t = length > 0 ? walked / length : 0;
    const a = 2 * Math.PI * waves * t;
    const off = flip * amplitude * (Math.sin(a) + second * Math.sin(2 * a) + third * Math.sin(3 * a));
    const n = tangent(samples, i);
    return { x: p.x - n.y * off, y: p.y + n.x * off };
  });
}

/** A smooth SVG line through the samples (quadratics between midpoints). */
function smoothLine(s: Pt[], move = true): string {
  if (s.length === 0) return "";
  const head = move ? `M ${fmt(s[0].x)} ${fmt(s[0].y)}` : `L ${fmt(s[0].x)} ${fmt(s[0].y)}`;
  if (s.length < 3) return `${head} ${s.slice(1).map((p) => `L ${fmt(p.x)} ${fmt(p.y)}`).join(" ")}`;
  const parts = [head];
  for (let i = 1; i < s.length - 1; i++) {
    const mx = (s[i].x + s[i + 1].x) / 2;
    const my = (s[i].y + s[i + 1].y) / 2;
    parts.push(`Q ${fmt(s[i].x)} ${fmt(s[i].y)} ${fmt(mx)} ${fmt(my)}`);
  }
  const last = s[s.length - 1];
  parts.push(`L ${fmt(last.x)} ${fmt(last.y)}`);
  return parts.join(" ");
}

/**
 * A closed, tapered outline around the samples, from width `w0` to `w1`. Always
 * wound the same way, whichever way the line runs, so overlapping stems in one
 * path stay solid under the default fill rule.
 */
function ribbon(s: Pt[], w0: number, w1: number): string {
  if (s.length < 2) return "";
  const widthAt = (i: number) => w0 + (w1 - w0) * (i / (s.length - 1));
  const side = (sign: 1 | -1) =>
    s.map((p, i) => {
      const n = tangent(s, i);
      const half = (widthAt(i) / 2) * sign;
      return { x: p.x - n.y * half, y: p.y + n.x * half };
    });
  const there = side(1);
  const back = side(-1).reverse();
  return `${smoothLine(there)} ${smoothLine(back, false)} Z`;
}

/** Points of a cubic Bézier curve. */
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
  return out;
}

/** Collects stems and leaves while one vine is grown, then hands back its art. */
class Canopy {
  private stems: string[] = [];
  private tones: [string[], string[], string[]] = [[], [], []];
  private veins: string[] = [];
  constructor(private r: Rng) {}

  stem(samples: Pt[], w0: number, w1: number) {
    const d = ribbon(samples, w0, w1);
    if (d) this.stems.push(d);
  }

  /** One leaf with a short stalk, growing from `base` towards `angle` (radians). */
  leaf(base: Pt, angle: number, length: number) {
    const stalk = 2 + length * 0.1;
    // Leaves hang: every one is pulled part of the way towards straight down.
    const dx = Math.cos(angle);
    const dy = Math.sin(angle) + DROOP;
    const d = Math.hypot(dx, dy) || 1;
    const cos = dx / d;
    const sin = dy / d;
    const at = (lx: number, ly: number) => `${fmt(base.x + lx * cos - ly * sin)} ${fmt(base.y + lx * sin + ly * cos)}`;
    const w = length * between(this.r, 0.3, 0.38);
    const b = stalk;
    const l = stalk + length;
    const tone = Math.min(2, Math.floor(this.r() * 3));
    // Broadest near the base, narrowing to a point.
    this.tones[tone].push(
      `M ${at(b, 0)} C ${at(b + length * 0.14, -w * 1.25)} ${at(b + length * 0.62, -w * 1.1)} ${at(l, 0)} C ${at(b + length * 0.62, w * 1.1)} ${at(b + length * 0.14, w * 1.25)} ${at(b, 0)} Z`,
    );
    this.veins.push(`M ${at(0, 0)} L ${at(b + length * 0.8, 0)}`);
  }

  /** Leaves (and now and then a little twig with its own cluster) along a stem. */
  foliage(s: Pt[], o: { from?: number; to?: number; spacing: [number, number]; size: [number, number]; twigs?: boolean }) {
    let length = 0;
    const walked = s.map((p, i) => (i === 0 ? 0 : (length += dist(s[i - 1], p))));
    const end = length - (o.to ?? 10);
    let at = o.from ?? 8;
    let side = this.r() < 0.5 ? 1 : -1;
    let i = 0;
    while (at < end) {
      while (i < s.length - 1 && walked[i] < at) i++;
      const n = tangent(s, i);
      const heading = Math.atan2(n.y, n.x);
      // Every step draws the same number of values, so a line that gets longer keeps the leaves it has.
      const [a, b, c, d, e] = [this.r(), this.r(), this.r(), this.r(), this.r()];
      const size = o.size[0] + (o.size[1] - o.size[0]) * a;
      const angle = heading + side * (0.55 + b * 0.6);
      if (o.twigs && c < 0.34) {
        // A short side shoot, bent a little, ending in a cluster of two or three leaves.
        const len = size * (0.75 + d * 0.65);
        const bend = angle + side * 0.35;
        const mid = { x: s[i].x + Math.cos(angle) * len * 0.55, y: s[i].y + Math.sin(angle) * len * 0.55 };
        const tip = { x: mid.x + Math.cos(bend) * len * 0.45, y: mid.y + Math.sin(bend) * len * 0.45 };
        this.stem(resample([s[i], mid, tip], 5), 1.9, 0.6);
        this.leaf(mid, angle - side * 0.9, size * 0.7);
        this.leaf(tip, bend - 0.55, size * 0.95);
        this.leaf(tip, bend + 0.6, size * 0.85);
        if (e < 0.5) this.leaf(tip, bend, size);
      } else {
        this.leaf(s[i], angle, size);
      }
      side = -side as 1 | -1;
      at += o.spacing[0] + (o.spacing[1] - o.spacing[0]) * e;
    }
  }

  art(): VineArt {
    return {
      stems: this.stems.join(" "),
      leaves: [this.tones[0].join(" "), this.tones[1].join(" "), this.tones[2].join(" ")],
      veins: this.veins.join(" "),
    };
  }
}

export type FamilyVine = {
  art: VineArt;
  /** The whole vine as one thin line per stem: what the finder dims and traces. */
  routeTo: (childIds: string[]) => string;
};

export type VineChild = { id: string; x: number; top: number };

/**
 * A family's vine: a trunk dropping from the parents' line, a limb reaching out
 * to each side, and a twig curving down to every child. Limbs thin out as they
 * go, like a real branch.
 */
export function familyVine(start: Pt, children: VineChild[], seed: string, parentsBottom = start.y): FamilyVine {
  if (children.length === 0) return { art: { stems: "", leaves: ["", "", ""], veins: "" }, routeTo: () => "" };
  const r = rngFor(seed);
  const canopy = new Canopy(r);
  const tops = children.map((k) => k.top);
  const minTop = Math.min(...tops);
  // Limbs hang midway between the parents' cards and the children's, clear of both.
  const clear = Math.max(start.y, parentsBottom);
  const gap = minTop - clear;
  // Never let a limb overshoot the topmost child, or it would grow upward through a card.
  const junctionY = gap > 0 ? Math.min(clear + Math.max(gap * 0.5, 20), minTop - 2) : (start.y + minTop) / 2;

  const trunk = wander(resample([start, { x: start.x, y: junctionY }], 9), 1.3, 90, r() < 0.5 ? 1 : -1, r);
  canopy.stem(trunk, 7, 6);
  canopy.foliage(trunk, { from: 10, to: 6, spacing: [20, 30], size: [11, 15] });

  const routes = new Map<string, Pt[][]>();
  const route = (id: string, ...runs: Pt[][]) => routes.set(id, [trunk, ...runs]);

  for (const dir of [1, -1] as const) {
    const side = children.filter((k) => (k.x - start.x) * dir > 1).sort((a, b) => (a.x - b.x) * dir);
    if (side.length === 0) continue;
    const far = side[side.length - 1];
    const limb = wander(
      resample(roundCorners([{ x: start.x, y: junctionY }, { x: far.x, y: junctionY }, { x: far.x, y: far.top }], 26), 14),
      4.2,
      170,
      r() < 0.5 ? 1 : -1,
      r,
    );
    canopy.stem(limb, 6, 2.4);
    canopy.foliage(limb, { from: 16, to: 16, spacing: [24, 42], size: [15, 25], twigs: true });
    route(far.id, limb);

    side.slice(0, -1).forEach((kid, i) => {
      const prevX = i === 0 ? start.x : side[i - 1].x;
      const forkX = kid.x - dir * Math.min(30, Math.abs(kid.x - prevX) * 0.45);
      let fork = 0;
      while (fork < limb.length - 1 && (forkX - limb[fork].x) * dir > 0) fork++;
      const p0 = limb[fork];
      const twig = cubic(
        p0,
        { x: kid.x - dir * 8, y: p0.y + 3 },
        { x: kid.x, y: p0.y + (kid.top - p0.y) * 0.4 },
        { x: kid.x, y: kid.top },
        12,
      );
      canopy.stem(twig, 3.4, 2);
      canopy.foliage(twig, { from: 12, to: 14, spacing: [18, 30], size: [12, 19] });
      route(kid.id, limb.slice(0, fork + 1), twig);
    });
  }

  for (const kid of children) {
    if (Math.abs(kid.x - start.x) > 1) continue;
    const drop = wander(resample([{ x: start.x, y: junctionY }, { x: kid.x, y: kid.top }], 9), 1.3, 90, r() < 0.5 ? 1 : -1, r);
    canopy.stem(drop, 5, 2.4);
    canopy.foliage(drop, { from: 8, to: 14, spacing: [18, 30], size: [12, 19] });
    route(kid.id, drop);
  }

  return {
    art: canopy.art(),
    routeTo: (ids) => {
      const seen = new Set<Pt[]>();
      const parts: string[] = [];
      for (const id of ids) {
        for (const run of routes.get(id) ?? []) {
          if (seen.has(run)) continue;
          seen.add(run);
          parts.push(smoothLine(run));
        }
      }
      return parts.join(" ");
    },
  };
}

export type CoupleVine = {
  /** Where the children's vine starts: the middle of this couple's line. */
  anchor: Pt;
  label: { x: number; y: number; placement: "above" | "below" };
  /** A single wandering line along the vine (past marriages, and the finder's route). */
  line: string;
  /** Two strands twisting together, with leaves. Only a current marriage grows these. */
  art: VineArt;
};

/**
 * The line between partners. Married couples get two strands twined around each
 * other, with a few leaves; every other status keeps a single line, drawn with
 * that status's dash pattern, so the two can't be mistaken for each other.
 */
export function coupleVine(a: Rect, b: Rect, lane: number, seed: string, twined: boolean): CoupleVine {
  const geo = coupleLine(a, b, lane);
  const r = rngFor(seed);
  const canopy = new Canopy(r);
  const spine = resample(roundCorners(geo.points, 14), 6);
  const line = wander(spine, twined ? 0 : 1.6, 50);
  if (twined) {
    // Long, lazy crossings: at this size a tight twist reads as a chain.
    canopy.stem(wander(spine, 2, 44), 3, 3);
    canopy.stem(wander(spine, 2, 44, -1), 2.2, 2.2);
    canopy.foliage(line, { from: 10, to: 10, spacing: [15, 24], size: [10, 15] });
  }
  return { anchor: geo.anchor, label: geo.label, line: smoothLine(line), art: canopy.art() };
}

/** A free-standing branch, thick at `from` and thinning to `to`: the poster's title decoration. */
export function sprigVine(from: Pt, to: Pt, seed: string): VineArt {
  const r = rngFor(seed);
  const canopy = new Canopy(r);
  const branch = wander(resample([from, to], 10), 6, 210, r() < 0.5 ? 1 : -1, r);
  canopy.stem(branch, 7, 1.2);
  canopy.foliage(branch, { from: 14, to: 2, spacing: [20, 34], size: [15, 25], twigs: true });
  return canopy.art();
}

/** A family vine hanging from a couple (or a single parent), from card positions. */
export function familyVineFromCards(
  partners: { a: Rect; b: Rect | null; lane: number },
  children: { id: string; rect: Rect; width: number }[],
  seed: string,
): FamilyVine | null {
  if (children.length === 0) return null;
  const start = partners.b ? coupleLine(partners.a, partners.b, partners.lane).anchor : soloAnchor(partners.a);
  const bottomOf = (r: Rect) => r.y + (r.height ?? NODE_HEIGHT);
  const parentsBottom = Math.max(bottomOf(partners.a), partners.b ? bottomOf(partners.b) : 0);
  return familyVine(start, children.map((c) => ({ id: c.id, x: c.rect.x + c.width / 2, top: c.rect.y })), seed, parentsBottom);
}

/** A single wandering line between two points: adoption and guardian links. */
export function linkVine(from: Pt, to: Pt, seed: string): string {
  const r = rngFor(seed);
  const mid = (from.y + to.y) / 2;
  const curve = cubic(from, { x: from.x, y: mid }, { x: to.x, y: mid }, to, 24);
  return smoothLine(wander(resample(curve, 12), 2.4, 80, r() < 0.5 ? 1 : -1));
}
