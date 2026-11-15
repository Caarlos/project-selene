// MCDA engine (PLAN.md section 7.2): five KPI arrays per scenario, weighted score, hard filters.
// Pure functions over typed arrays; `NaN` marks "no value". The `*Into` functions write into caller buffers.
import {DEFAULT_KPI_SETTINGS, FILTER_CONFIG, FILTER_IDS, KPI_IDS, type FilterId, type KpiId, type KpiSettings} from './kpiConfig';
import {projectStereo_m, surfaceDistance_m} from './projection';
import type {Cells} from './types';

export type Weights = Record<KpiId, number>;
export type FilterState = Record<FilterId, {enabled: boolean; limit: number}>;

export interface Kpis {
  /** Per KPI, per cell, 0..1 or NaN. */
  values: Record<KpiId, Float32Array>;
  /** false = every input of the KPI is null for this scenario. */
  available: Record<KpiId, boolean>;
  /** Per cell: row index of the nearest cell with ice_index >= the anchor (itself when it qualifies), -1 if none. */
  nearestIce: Int32Array;
  /** Per cell: surface distance in metres to that cell, NaN when there is none. */
  nearestIceDistance_m: Float32Array;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * For each cell the nearest qualifying cell by great-circle distance on the lunar sphere. A square grid over the
 * stereographic plane (bins of `binSize_m`) is searched ring by ring; the search stops once no farther ring can hold
 * a closer cell (stereographic distances exceed true ones by at most the local scale factor `kMax`).
 */
export function nearestIceCells(
  lat_deg: ArrayLike<number>,
  lon_deg: ArrayLike<number>,
  isIce: ArrayLike<boolean>,
  binSize_m = 20_000,
): {index: Int32Array; distance_m: Float32Array} {
  const n = lat_deg.length;
  const index = new Int32Array(n).fill(-1);
  const distance_m = new Float32Array(n).fill(NaN);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  let extent = 0;
  let maxLat = -90;
  for (let i = 0; i < n; i++) {
    [px[i], py[i]] = projectStereo_m(lat_deg[i], lon_deg[i]);
    extent = Math.max(extent, Math.abs(px[i]), Math.abs(py[i]));
    maxLat = Math.max(maxLat, lat_deg[i]);
  }
  const side = Math.max(1, Math.ceil((2 * extent) / binSize_m) + 1);
  const bins: number[][] = Array.from({length: side * side}, () => []);
  const bx = (v: number) => Math.min(side - 1, Math.floor((v + extent) / binSize_m));
  let nIce = 0;
  for (let i = 0; i < n; i++) {
    if (!isIce[i]) continue;
    bins[bx(py[i]) * side + bx(px[i])].push(i);
    nIce++;
  }
  if (nIce === 0) return {index, distance_m};
  const kMax = 1 / Math.cos(((90 + maxLat) * Math.PI) / 360) ** 2;
  for (let i = 0; i < n; i++) {
    const cx = bx(px[i]);
    const cy = bx(py[i]);
    let best = Infinity;
    let bestJ = -1;
    for (let r = 0; r < side; r++) {
      // Rings r and beyond are unsearched; their cells are at least r-1 bins away in the plane.
      if (bestJ >= 0 && best <= (Math.max(0, r - 1) * binSize_m) / kMax) break;
      for (let y = Math.max(0, cy - r); y <= Math.min(side - 1, cy + r); y++) {
        const edgeRow = y === cy - r || y === cy + r;
        const step = edgeRow || r === 0 ? 1 : 2 * r; // inner rows: only the two end bins of the ring
        for (let x = cx - r; x <= cx + r; x += step) {
          if (x < 0 || x >= side) continue;
          for (const j of bins[y * side + x]) {
            const d = surfaceDistance_m(lat_deg[i], lon_deg[i], lat_deg[j], lon_deg[j]);
            if (d < best) {
              best = d;
              bestJ = j;
            }
          }
        }
      }
    }
    index[i] = bestJ;
    distance_m[i] = bestJ >= 0 ? best : NaN;
  }
  return {index, distance_m};
}

/** Mean columns exist only for the baseline (PLAN 7.3): on a custom range the best-point columns are always used. */
export function effectiveSettings(s: KpiSettings, customRange: boolean): KpiSettings {
  return customRange && s.sunCommsBasis === 'mean' ? {...s, sunCommsBasis: 'best'} : s;
}

/** Computes the five KPI arrays; once per scenario and whenever a reference value changes (not on weight moves). */
export function computeKpis(cells: Cells, settings: KpiSettings = DEFAULT_KPI_SETTINGS): Kpis {
  const sunCol = settings.sunCommsBasis === 'mean' ? cells.sun_mean_pct : cells.sun_best_pct;
  const earthCol = settings.sunCommsBasis === 'mean' ? cells.earth_mean_pct : cells.earth_best_pct;
  const n = cells.h3.length;
  const values = {} as Record<KpiId, Float32Array>;
  for (const k of KPI_IDS) values[k] = new Float32Array(n).fill(NaN);
  const available = {} as Record<KpiId, boolean>;
  for (const k of KPI_IDS) available[k] = false;

  const isIce = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const sun = sunCol[i];
    const earth = earthCol[i];
    const safe = cells.safe_frac[i];
    const svf = cells.svf[i];
    const ice = cells.ice_index[i];
    if (sun !== null) values.sun[i] = clamp01(sun / 100);
    if (earth !== null) values.comms[i] = clamp01(earth / 100);
    if (safe !== null) values.terrain[i] = clamp01(safe);
    if (svf !== null) values.protection[i] = clamp01((1 - svf) / settings.shieldingScale);
    isIce[i] = ice !== null && ice >= settings.iceIndexMin;
    if (sun !== null) available.sun = true;
    if (earth !== null) available.comms = true;
    if (safe !== null) available.terrain = true;
    if (svf !== null) available.protection = true;
    if (ice !== null) available.ice = true;
  }
  const near = nearestIceCells(cells.lat, cells.lon, isIce);
  if (available.ice) {
    // No ice-bearing cell at all: every cell is infinitely far, so the KPI is 0.
    for (let i = 0; i < n; i++) {
      const d = near.distance_m[i];
      values.ice[i] = Number.isNaN(d) ? 0 : clamp01(1 - d / (settings.iceDistanceScale_km * 1000));
    }
  }
  return {values, available, nearestIce: near.index, nearestIceDistance_m: near.distance_m};
}

export type ScoreHint = 'ok' | 'zero-weights';

const NEUTRAL_SCORE = 0.5;

/**
 * score = sum(w_k KPI_k) / sum(w_k) over the available KPIs, written into `out` (0..1).
 * A cell whose KPI is NaN drops that KPI from its own sums; a cell with no usable KPI gets NaN.
 * When the available weights sum to 0 every cell gets the neutral score 0.5 and the hint is 'zero-weights'.
 */
export function scoreInto(kpis: Kpis, weights: Weights, out: Float32Array): ScoreHint {
  let total = 0;
  for (const k of KPI_IDS) if (kpis.available[k] && weights[k] > 0) total += weights[k];
  if (total === 0) {
    out.fill(NEUTRAL_SCORE);
    return 'zero-weights';
  }
  const {sun, comms, terrain, ice, protection} = kpis.values;
  const ws = kpis.available.sun ? weights.sun : 0;
  const wc = kpis.available.comms ? weights.comms : 0;
  const wt = kpis.available.terrain ? weights.terrain : 0;
  const wi = kpis.available.ice ? weights.ice : 0;
  const wp = kpis.available.protection ? weights.protection : 0;
  for (let i = 0; i < out.length; i++) {
    let num = 0;
    let den = 0;
    let v = sun[i];
    if (ws > 0 && v === v) {
      num += ws * v;
      den += ws;
    }
    v = comms[i];
    if (wc > 0 && v === v) {
      num += wc * v;
      den += wc;
    }
    v = terrain[i];
    if (wt > 0 && v === v) {
      num += wt * v;
      den += wt;
    }
    v = ice[i];
    if (wi > 0 && v === v) {
      num += wi * v;
      den += wi;
    }
    v = protection[i];
    if (wp > 0 && v === v) {
      num += wp * v;
      den += wp;
    }
    out[i] = den > 0 ? num / den : NaN;
  }
  return 'ok';
}

/** Sets `out[i]` = 1 for cells excluded by an enabled filter (a null input is never excluded). Returns the count. */
export function filtersInto(cells: Cells, filters: FilterState, out: Uint8Array): number {
  out.fill(0);
  for (const id of FILTER_IDS) {
    const {enabled, limit} = filters[id];
    if (!enabled) continue;
    const col = cells[id];
    const isMin = FILTER_CONFIG[id].kind === 'min';
    for (let i = 0; i < out.length; i++) {
      const v = col[i];
      if (v !== null && (isMin ? v < limit : v > limit)) out[i] = 1;
    }
  }
  let count = 0;
  for (let i = 0; i < out.length; i++) count += out[i];
  return count;
}

/** Row indexes of the `n` best-scoring cells that are not excluded, best first. NaN scores are skipped. */
export function topCells(score: Float32Array, excluded: Uint8Array, n: number): number[] {
  const top: number[] = [];
  for (let i = 0; i < score.length; i++) {
    const s = score[i];
    if (excluded[i] || s !== s) continue;
    if (top.length === n && s <= score[top[n - 1]]) continue;
    let p = top.length === n ? n - 1 : top.length;
    while (p > 0 && score[top[p - 1]] < s) {
      top[p] = top[p - 1];
      p--;
    }
    top[p] = i;
  }
  return top;
}

/** Share of each available KPI in the total weight, 0..1; unavailable KPIs and all-zero weights give 0. */
export function weightShares(weights: Weights, available: Record<KpiId, boolean>): Record<KpiId, number> {
  let total = 0;
  for (const k of KPI_IDS) if (available[k]) total += weights[k];
  const out = {} as Record<KpiId, number>;
  for (const k of KPI_IDS) out[k] = available[k] && total > 0 ? weights[k] / total : 0;
  return out;
}
