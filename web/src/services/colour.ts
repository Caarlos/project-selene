// Colour ramp of the map: viridis (perceptually ordered, colour-blind safe), semi-transparent over the hillshade.

const VIRIDIS = ['440154', '482878', '3e4a89', '31688e', '26828e', '1f9e89', '35b779', '6ece58', 'b5de2b', 'fde725'];

/** CSS stops of the ramp, low to high, for the legend gradient. */
export const RAMP_CSS = VIRIDIS.map((h) => `#${h}`);

/** 256 RGB triplets, linear interpolation between the viridis stops. */
const LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
  const t = (i / 255) * (VIRIDIS.length - 1);
  const k = Math.min(Math.floor(t), VIRIDIS.length - 2);
  const a = parseInt(VIRIDIS[k], 16);
  const b = parseInt(VIRIDIS[k + 1], 16);
  for (let c = 0; c < 3; c++) {
    const shift = 16 - 8 * c;
    const va = (a >> shift) & 255;
    const vb = (b >> shift) & 255;
    LUT[i * 3 + c] = Math.round(va + (vb - va) * (t - k));
  }
}

export type Rgba = [number, number, number, number];

/** Cells with a value: the hillshade stays visible underneath. */
export const CELL_ALPHA = 175;
/** Excluded by a hard filter: greyed, never hidden (PLAN.md section 7.1). */
export const EXCLUDED_RGBA: Rgba = [150, 150, 150, 150];
/** No value (null metric or no score yet): faint neutral veil. */
export const NULL_RGBA: Rgba = [30, 30, 40, 70];

/**
 * Writes the colour of one cell into `target` (no allocation) and returns it.
 * `score` is 0..1 (clamped); NaN means "no value". `excluded` non-zero wins over the score.
 */
export function writeCellColour<T extends number[] | Uint8Array | Uint8ClampedArray>(
  target: T,
  score: number,
  excluded: number,
): T {
  if (excluded || Number.isNaN(score)) {
    const c = excluded ? EXCLUDED_RGBA : NULL_RGBA;
    target[0] = c[0];
    target[1] = c[1];
    target[2] = c[2];
    target[3] = c[3];
    return target;
  }
  const i = 3 * Math.round(255 * Math.min(1, Math.max(0, score)));
  target[0] = LUT[i];
  target[1] = LUT[i + 1];
  target[2] = LUT[i + 2];
  target[3] = CELL_ALPHA;
  return target;
}
