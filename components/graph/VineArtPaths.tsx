import { BARK, LEAF_TONES, VEIN, VEIN_WIDTH, type VineArt } from "@/lib/graph/vines";

/** Draws one vine's bark and leaves. Purely decorative: it never takes clicks. */
export function VineArtPaths({ art }: { art: VineArt }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {art.leaves.map((d, i) => d && <path key={i} d={d} style={{ fill: LEAF_TONES[i], stroke: "none" }} />)}
      {art.veins && <path d={art.veins} style={{ fill: "none", stroke: VEIN, strokeWidth: VEIN_WIDTH }} />}
      {art.stems && <path d={art.stems} style={{ fill: BARK, stroke: "none" }} />}
    </g>
  );
}
