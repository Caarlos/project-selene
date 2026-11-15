// Sun and Earth directions, horizon lookup, lit fraction and the four date-dependent metrics (PLAN.md sections 5.2-5.4).
// Allocation-free scalar / typed-array functions: the custom-dates worker (W4) runs them over every cell.
// Conventions (section 5): azimuth in degrees clockwise from local north, elevation in degrees above the local
// horizontal, longitude east-positive, horizon rows Int16 in centi-degrees at azimuths 0..359.
import {R_MOON_M} from './projection';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Solar angular radius, degrees (section 5.3). */
export const SUN_ANGULAR_RADIUS_DEG = 0.266;

/** Local frame of a point: Up, East, North unit vectors (section 5), 9 numbers. */
const frame = new Float64Array(9);
const azel = new Float64Array(2);

function frameInto(lat_deg: number, lon_deg: number, f: Float64Array): void {
  const cp = Math.cos(lat_deg * RAD);
  const sp = Math.sin(lat_deg * RAD);
  const cl = Math.cos(lon_deg * RAD);
  const sl = Math.sin(lon_deg * RAD);
  f[0] = cp * cl;
  f[1] = cp * sl;
  f[2] = sp;
  f[3] = -sl;
  f[4] = cl;
  f[5] = 0;
  f[6] = -sp * cl;
  f[7] = -sp * sl;
  f[8] = cp;
}

/** Writes [azimuth_deg in [0, 360), elevation_deg] of direction (dx, dy, dz) (any length) in frame `f`. */
function dirAzEl(dx: number, dy: number, dz: number, f: Float64Array, out: Float64Array): void {
  const norm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const up = (dx * f[0] + dy * f[1] + dz * f[2]) / norm;
  const east = dx * f[3] + dy * f[4] + dz * f[5];
  const north = dx * f[6] + dy * f[7] + dz * f[8];
  let az = Math.atan2(east, north) * DEG;
  if (az < 0) az += 360;
  if (az >= 360) az = 0; // -1e-17 deg rounds to 360
  out[0] = az;
  out[1] = Math.asin(up > 1 ? 1 : up < -1 ? -1 : up) * DEG;
}

/** Sun azimuth and elevation (degrees) at a point on the sphere, into out[0], out[1]. Parallax ignored (section 5.2). */
export function sunAzEl(
  lat_deg: number,
  lon_deg: number,
  subSolarLon_deg: number,
  subSolarLat_deg: number,
  out: Float64Array,
): void {
  frameInto(lat_deg, lon_deg, frame);
  const cp = Math.cos(subSolarLat_deg * RAD);
  dirAzEl(
    cp * Math.cos(subSolarLon_deg * RAD),
    cp * Math.sin(subSolarLon_deg * RAD),
    Math.sin(subSolarLat_deg * RAD),
    frame,
    out,
  );
}

/**
 * Earth azimuth and elevation (degrees) of the Earth's centre from a point at `height_m` above the reference sphere,
 * into out[0], out[1]. Direction = normalise(D unit(sub-Earth) - r p), parallax kept (section 5.2).
 */
export function earthAzEl(
  lat_deg: number,
  lon_deg: number,
  height_m: number,
  subEarthLon_deg: number,
  subEarthLat_deg: number,
  distance_km: number,
  out: Float64Array,
): void {
  frameInto(lat_deg, lon_deg, frame);
  const r_km = (R_MOON_M + height_m) / 1000;
  const cp = Math.cos(subEarthLat_deg * RAD);
  dirAzEl(
    distance_km * cp * Math.cos(subEarthLon_deg * RAD) - r_km * frame[0],
    distance_km * cp * Math.sin(subEarthLon_deg * RAD) - r_km * frame[1],
    distance_km * Math.sin(subEarthLat_deg * RAD) - r_km * frame[2],
    frame,
    out,
  );
}

/** Horizon elevation in degrees at azimuth `az_deg`: linear between integer azimuths, wrapping 359 -> 0. */
export function horizonAt(horizon_cdeg: Int16Array, az_deg: number): number {
  let a = az_deg % 360;
  if (a < 0) a += 360;
  const i0 = Math.floor(a) % 360;
  const w = a - Math.floor(a);
  return (horizon_cdeg[i0] * (1 - w) + horizon_cdeg[(i0 + 1) % 360] * w) / 100;
}

/** Lit fraction of the solar disc, 0..1 (section 5.3): clamp((el + rho - H) / (2 rho), 0, 1). */
export function litFraction(sunEl_deg: number, horizon_deg: number): number {
  const f = (sunEl_deg + SUN_ANGULAR_RADIUS_DEG - horizon_deg) / (2 * SUN_ANGULAR_RADIUS_DEG);
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** Index of `iso` in a table starting at `t0_iso` with `step_s`, rounded to the nearest row (may fall outside 0..n). */
export function timeIndex(t0_iso: string, step_s: number, iso: string): number {
  return Math.round((Date.parse(iso) - Date.parse(t0_iso)) / 1000 / step_s);
}

/** Row range [startIndex, endIndex) of [start, end) clipped to the `n` rows of the table. */
export function clipRange(
  t0_iso: string,
  step_s: number,
  n: number,
  start_iso: string,
  end_iso: string,
): {startIndex: number; endIndex: number} {
  const s = Math.max(0, timeIndex(t0_iso, step_s, start_iso));
  const e = Math.min(n, timeIndex(t0_iso, step_s, end_iso));
  return {startIndex: s, endIndex: Math.max(s, e)};
}

/** Offsets in the `out` array of `rangeMetrics`. */
export const SUN_PCT = 0;
export const DARK_MAX_H = 1;
export const EARTH_PCT = 2;
export const EARTH_OUTAGE_MAX_H = 3;

/**
 * The four date-dependent metrics of one point over table rows [startIndex, endIndex) (section 5.3, 5.4), into `out`:
 * out[0] sun_pct, out[1] dark_max_h, out[2] earth_pct, out[3] earth_outage_max_h (hours). All NaN for an empty range.
 * Dark = lit fraction 0; Earth visible = elevation above the horizon at its azimuth (mask 0). Runs touching either
 * end of the range are counted. `table` is the n x 5 ephemeris (sub-solar lon, lat, sub-Earth lon, lat, distance km).
 */
export function rangeMetrics(
  lat_deg: number,
  lon_deg: number,
  height_m: number,
  horizon_cdeg: Int16Array,
  table: Float32Array,
  startIndex: number,
  endIndex: number,
  step_s: number,
  out: Float64Array,
): void {
  const n = endIndex - startIndex;
  if (!(n > 0)) {
    out.fill(NaN, 0, 4);
    return;
  }
  const f = frame; // module scratch: no allocation; nothing below calls the public sunAzEl / earthAzEl
  frameInto(lat_deg, lon_deg, f);
  const r_km = (R_MOON_M + height_m) / 1000;
  const ae = azel;
  let litSum = 0;
  let earthSteps = 0;
  let dark = 0;
  let darkMax = 0;
  let out_ = 0;
  let outMax = 0;
  for (let k = startIndex; k < endIndex; k++) {
    const o = k * 5;
    const cs = Math.cos(table[o + 1] * RAD);
    dirAzEl(cs * Math.cos(table[o] * RAD), cs * Math.sin(table[o] * RAD), Math.sin(table[o + 1] * RAD), f, ae);
    const lit = litFraction(ae[1], horizonAt(horizon_cdeg, ae[0]));
    litSum += lit;
    if (lit === 0) {
      if (++dark > darkMax) darkMax = dark;
    } else dark = 0;

    const ce = Math.cos(table[o + 3] * RAD);
    const D = table[o + 4];
    dirAzEl(
      D * ce * Math.cos(table[o + 2] * RAD) - r_km * f[0],
      D * ce * Math.sin(table[o + 2] * RAD) - r_km * f[1],
      D * Math.sin(table[o + 3] * RAD) - r_km * f[2],
      f,
      ae,
    );
    if (ae[1] > horizonAt(horizon_cdeg, ae[0])) {
      earthSteps++;
      out_ = 0;
    } else if (++out_ > outMax) outMax = out_;
  }
  const h = step_s / 3600;
  out[SUN_PCT] = (100 * litSum) / n;
  out[DARK_MAX_H] = darkMax * h;
  out[EARTH_PCT] = (100 * earthSteps) / n;
  out[EARTH_OUTAGE_MAX_H] = outMax * h;
}

/** A body's track for the chart: flat [azimuth_deg, elevation_deg, tableRow, ...] every `stride` rows of the range. */
export function bodyTrack(
  body: 'sun' | 'earth',
  lat_deg: number,
  lon_deg: number,
  height_m: number,
  table: Float32Array,
  startIndex: number,
  endIndex: number,
  stride: number,
): Float32Array {
  const count = Math.max(0, Math.ceil((endIndex - startIndex) / stride));
  const track = new Float32Array(count * 3);
  const ae = new Float64Array(2);
  for (let j = 0; j < count; j++) {
    const k = startIndex + j * stride;
    const o = k * 5;
    if (body === 'sun') sunAzEl(lat_deg, lon_deg, table[o], table[o + 1], ae);
    else earthAzEl(lat_deg, lon_deg, height_m, table[o + 2], table[o + 3], table[o + 4], ae);
    track[3 * j] = ae[0];
    track[3 * j + 1] = ae[1];
    track[3 * j + 2] = k;
  }
  return track;
}
