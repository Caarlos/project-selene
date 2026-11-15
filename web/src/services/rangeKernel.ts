// Fast full-grid kernel for the four date-dependent metrics (PLAN.md 5.2-5.4). Same maths as `rangeMetrics` in
// ephemeris.ts (results agree to 1e-6, tested), restructured: Sun and Earth vectors are computed once per range, the
// per-cell frame once per cell, and the time loop is dot products plus one atan2 and one asin per body.
import {R_MOON_M} from './projection';
import {SUN_ANGULAR_RADIUS_DEG} from './ephemeris';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const RHO = SUN_ANGULAR_RADIUS_DEG;

/** Per-time-step vectors of a row range, shared by every cell. */
export interface RangeVectors {
  n: number;
  step_s: number;
  /** n x 3: Sun unit vector (Moon-fixed frame) */
  sun: Float64Array;
  /** n x 3: Earth centre position, km */
  earth: Float64Array;
  /** n: |earth|^2, km^2 */
  earth2: Float64Array;
}

/** Table rows [startIndex, endIndex) as vectors. `table` is the n x 5 ephemeris. */
export function precomputeRange(table: Float32Array, startIndex: number, endIndex: number, step_s: number): RangeVectors {
  const n = Math.max(0, endIndex - startIndex);
  const sun = new Float64Array(3 * n);
  const earth = new Float64Array(3 * n);
  const earth2 = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const o = (startIndex + j) * 5;
    const cs = Math.cos(table[o + 1] * RAD);
    sun[3 * j] = cs * Math.cos(table[o] * RAD);
    sun[3 * j + 1] = cs * Math.sin(table[o] * RAD);
    sun[3 * j + 2] = Math.sin(table[o + 1] * RAD);
    const ce = Math.cos(table[o + 3] * RAD);
    const D = table[o + 4];
    const x = D * ce * Math.cos(table[o + 2] * RAD);
    const y = D * ce * Math.sin(table[o + 2] * RAD);
    const z = D * Math.sin(table[o + 3] * RAD);
    earth[3 * j] = x;
    earth[3 * j + 1] = y;
    earth[3 * j + 2] = z;
    earth2[j] = x * x + y * y + z * z;
  }
  return {n, step_s, sun, earth, earth2};
}

/** Azimuth (deg in [0, 360)) of (east, north), same wrap as `dirAzEl` in ephemeris.ts. */
function azimuth(east: number, north: number): number {
  let az = Math.atan2(east, north) * DEG;
  if (az < 0) az += 360;
  if (az >= 360) az = 0;
  return az;
}

/** Horizon in degrees at azimuth `az` (linear between integer azimuths, wrapping), same as `horizonAt`. */
function horizon(h: Int16Array, az: number): number {
  const i0 = az | 0; // az is in [0, 360)
  const w = az - i0;
  return (h[i0] * (1 - w) + h[i0 === 359 ? 0 : i0 + 1] * w) * 0.01;
}

/** The four metrics of one point over the range, into out[0..3] = sun_pct, dark_max_h, earth_pct, earth_outage_max_h. */
export function cellMetrics(
  lat_deg: number,
  lon_deg: number,
  height_m: number,
  horizon_cdeg: Int16Array,
  rv: RangeVectors,
  out: Float64Array,
): void {
  const {n, sun, earth, earth2} = rv;
  if (!(n > 0)) {
    out.fill(NaN, 0, 4);
    return;
  }
  const cp = Math.cos(lat_deg * RAD);
  const sp = Math.sin(lat_deg * RAD);
  const cl = Math.cos(lon_deg * RAD);
  const sl = Math.sin(lon_deg * RAD);
  const ux = cp * cl;
  const uy = cp * sl;
  const uz = sp;
  const ex = -sl;
  const ey = cl;
  const nx = -sp * cl;
  const ny = -sp * sl;
  const nz = cp;
  const r_km = (R_MOON_M + height_m) / 1000;
  const r2 = r_km * r_km;
  let litSum = 0;
  let earthSteps = 0;
  let dark = 0;
  let darkMax = 0;
  let gap = 0;
  let gapMax = 0;
  for (let j = 0; j < n; j++) {
    const k = 3 * j;
    const sx = sun[k];
    const sy = sun[k + 1];
    const sz = sun[k + 2];
    // Sun: the vector is a unit vector up to rounding; normalise as dirAzEl does.
    const sn = Math.sqrt(sx * sx + sy * sy + sz * sz);
    let up = (sx * ux + sy * uy + sz * uz) / sn;
    const sunAz = azimuth(sx * ex + sy * ey, sx * nx + sy * ny + sz * nz);
    const sunEl = Math.asin(up > 1 ? 1 : up < -1 ? -1 : up) * DEG;
    let f = (sunEl + RHO - horizon(horizon_cdeg, sunAz)) / (2 * RHO);
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    litSum += f;
    if (f === 0) {
      if (++dark > darkMax) darkMax = dark;
    } else dark = 0;

    // Earth: d = E - r U, so d.U = E.U - r, d.East = E.East, d.North = E.North, |d|^2 = |E|^2 - 2 r E.U + r^2.
    const qx = earth[k];
    const qy = earth[k + 1];
    const qz = earth[k + 2];
    const eu = qx * ux + qy * uy + qz * uz;
    up = (eu - r_km) / Math.sqrt(earth2[j] - 2 * r_km * eu + r2);
    const eAz = azimuth(qx * ex + qy * ey, qx * nx + qy * ny + qz * nz);
    const eEl = Math.asin(up > 1 ? 1 : up < -1 ? -1 : up) * DEG;
    if (eEl > horizon(horizon_cdeg, eAz)) {
      earthSteps++;
      gap = 0;
    } else if (++gap > gapMax) gapMax = gap;
  }
  const h = rv.step_s / 3600;
  out[0] = (100 * litSum) / n;
  out[1] = darkMax * h;
  out[2] = (100 * earthSteps) / n;
  out[3] = gapMax * h;
}
