// DSN ground segment (PLAN.md 5.4, D-09): when each deep-space station sees the Moon above 10 deg, and the combined
// availability with the Earth link of a lunar cell. astronomy-engine is used only for the Moon as seen from Earth.
// The station part is the same for every lunar site; only the "cell sees Earth" row depends on the cell.
import {Body, Equator, Horizon, Observer} from 'astronomy-engine';
import {earthAzEl, horizonAt} from './ephemeris';

export interface Station {
  name: string;
  lat_deg: number;
  lon_deg: number;
}

export const STATIONS: Station[] = [
  {name: 'Madrid', lat_deg: 40.4314, lon_deg: -4.2481},
  {name: 'Goldstone', lat_deg: 35.4267, lon_deg: -116.89},
  {name: 'Canberra', lat_deg: -35.4014, lon_deg: 148.9817},
];

/** The Moon is usable above this elevation, degrees. */
export const MIN_MOON_ELEVATION_DEG = 10;

/** Moon elevation (deg, topocentric, no refraction) at a station into out[from..to), step j = table row first + j. */
export function moonElevations(
  station: Station,
  t0_ms: number,
  step_s: number,
  first: number,
  out: Float32Array,
  from = 0,
  to = out.length,
): Float32Array {
  const obs = new Observer(station.lat_deg, station.lon_deg, 0);
  for (let j = from; j < to; j++) {
    const date = new Date(t0_ms + (first + j) * step_s * 1000);
    const eq = Equator(Body.Moon, date, obs, true, true);
    out[j] = Horizon(date, obs, eq.ra, eq.dec).altitude;
  }
  return out;
}

/** Runs of 1 in `flags` as [start, end) step pairs. */
export function windows(flags: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i] === 1;
    if (on && s < 0) s = i;
    else if (!on && s >= 0) {
      out.push([s, i]);
      s = -1;
    }
  }
  return out;
}

const pct = (flags: Uint8Array) => {
  let c = 0;
  for (let i = 0; i < flags.length; i++) c += flags[i];
  return flags.length ? (100 * c) / flags.length : NaN;
};

export interface DsnResult {
  /** Steps in the range */
  n: number;
  step_s: number;
  /** Per station, per step: 1 = Moon above the minimum elevation */
  usable: Uint8Array[];
  /** 1 = at least one station sees the Moon */
  any: Uint8Array;
  stationPct: number[];
  anyPct: number;
  windows: [number, number][][];
}

/**
 * Per-station Moon visibility over table rows [startIndex, endIndex), computed in slices of `slice` steps with a
 * macrotask yield between them so the page stays responsive. `isCancelled` aborts (resolves null).
 */
export async function computeDsn(
  t0_ms: number,
  step_s: number,
  startIndex: number,
  endIndex: number,
  isCancelled: () => boolean = () => false,
  slice = 400,
): Promise<DsnResult | null> {
  const n = Math.max(0, endIndex - startIndex);
  const usable = STATIONS.map(() => new Uint8Array(n));
  const elev = new Float32Array(n);
  for (let s = 0; s < STATIONS.length; s++) {
    for (let from = 0; from < n; from += slice) {
      if (isCancelled()) return null;
      moonElevations(STATIONS[s], t0_ms, step_s, startIndex, elev, from, Math.min(n, from + slice));
      await new Promise((r) => setTimeout(r, 0));
    }
    for (let i = 0; i < n; i++) usable[s][i] = elev[i] > MIN_MOON_ELEVATION_DEG ? 1 : 0;
  }
  const any = new Uint8Array(n);
  for (let i = 0; i < n; i++) any[i] = usable.some((u) => u[i] === 1) ? 1 : 0;
  return {n, step_s, usable, any, stationPct: usable.map(pct), anyPct: pct(any), windows: usable.map(windows)};
}

/** Per step: 1 = Earth's centre is above the cell's horizon (same test as the kernel). */
export function earthVisibleSteps(
  lat_deg: number,
  lon_deg: number,
  height_m: number,
  horizon_cdeg: Int16Array,
  table: Float32Array,
  startIndex: number,
  endIndex: number,
): Uint8Array {
  const out = new Uint8Array(Math.max(0, endIndex - startIndex));
  const ae = new Float64Array(2);
  for (let j = 0; j < out.length; j++) {
    const o = (startIndex + j) * 5;
    earthAzEl(lat_deg, lon_deg, height_m, table[o + 2], table[o + 3], table[o + 4], ae);
    out[j] = ae[1] > horizonAt(horizon_cdeg, ae[0]) ? 1 : 0;
  }
  return out;
}

/** Percentage of steps where both flag arrays are 1. */
export function combinedPct(a: Uint8Array, b: Uint8Array): number {
  const both = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) both[i] = a[i] & b[i];
  return pct(both);
}

/** Fraction of 1s per block of `perBin` steps (the last block may be shorter), for compact timelines. */
export function binFractions(flags: Uint8Array, perBin: number): Float32Array {
  const bins = Math.ceil(flags.length / perBin);
  const out = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    const end = Math.min(flags.length, (b + 1) * perBin);
    let c = 0;
    for (let i = b * perBin; i < end; i++) c += flags[i];
    out[b] = c / (end - b * perBin);
  }
  return out;
}
