// Pure parts of the custom-dates computation (PLAN.md 7.3): range validation, splitting cells over workers, merging
// results. No DOM and no Worker here, so they are unit-tested.

/** Longest custom range, days (D-08). */
export const MAX_RANGE_DAYS = 366;
/** Cells a worker computes between two progress messages. */
export const PROGRESS_CHUNK_CELLS = 100;
export const MAX_WORKERS = 4;

/** The four columns of a custom range, in worker output order. */
export const RANGE_COLUMNS = ['sun_best_pct', 'dark_max_h_best', 'earth_best_pct', 'earth_outage_max_h_best'] as const;
export type RangeColumn = (typeof RANGE_COLUMNS)[number];
/** Per column, per cell (row order of the scenario); NaN = no value (cell without a horizon row). */
export type RangeValues = Record<RangeColumn, Float64Array>;

export type RangeCheck = {ok: true; startIndex: number; endIndex: number} | {ok: false; error: string};

/**
 * Validates [start, end] (UTC dates "YYYY-MM-DD", both days included) against the ephemeris table
 * (`t0_iso`, `step_s`, `n` rows) and the 366-day limit; returns the table row range [startIndex, endIndex).
 */
export function validateRange(
  t0_iso: string,
  step_s: number,
  n: number,
  start: string,
  end: string,
): RangeCheck {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(start) || !re.test(end)) return {ok: false, error: 'Enter both dates as YYYY-MM-DD.'};
  const t0 = Date.parse(t0_iso);
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`) + 86_400_000; // the end day is included
  if (Number.isNaN(s) || Number.isNaN(e) || isoDay(s) !== start || isoDay(e - 86_400_000) !== end) return {ok: false, error: 'Not a valid date.'};
  if (e <= s) return {ok: false, error: 'The end date must not be before the start date.'};
  const days = (e - s) / 86_400_000;
  if (days > MAX_RANGE_DAYS) return {ok: false, error: `At most ${MAX_RANGE_DAYS} days (this range has ${days}).`};
  const span = (iso: number) => new Date(iso).toISOString().slice(0, 10);
  const tEnd = t0 + n * step_s * 1000;
  if (s < t0 || e > tEnd) {
    return {ok: false, error: `Outside the ephemeris table (${span(t0)} to ${span(tEnd - 86_400_000)}).`};
  }
  return {ok: true, startIndex: Math.round((s - t0) / 1000 / step_s), endIndex: Math.round((e - t0) / 1000 / step_s)};
}

/** Number of workers for `hardwareConcurrency` (may be undefined): 1 to MAX_WORKERS. */
export function workerCount(hardwareConcurrency: number | undefined): number {
  const h = Math.floor(hardwareConcurrency ?? 1);
  return Math.min(MAX_WORKERS, Math.max(1, Number.isFinite(h) ? h : 1));
}

/** Splits cells [0, nCells) into at most `parts` contiguous [from, to) blocks of near-equal size (empty blocks dropped). */
export function splitCells(nCells: number, parts: number): {from: number; to: number}[] {
  const out: {from: number; to: number}[] = [];
  const k = Math.max(1, Math.min(parts, nCells));
  for (let i = 0; i < k && nCells > 0; i++) {
    const from = Math.floor((i * nCells) / k);
    const to = Math.floor(((i + 1) * nCells) / k);
    if (to > from) out.push({from, to});
  }
  return out;
}

export function emptyRangeValues(nCells: number): RangeValues {
  const v = {} as RangeValues;
  for (const c of RANGE_COLUMNS) v[c] = new Float64Array(nCells).fill(NaN);
  return v;
}

/** Writes interleaved results (4 values per cell, cells `from`..) of one worker into the columns. */
export function mergeChunk(values: RangeValues, from: number, interleaved: Float64Array): void {
  const count = interleaved.length / RANGE_COLUMNS.length;
  RANGE_COLUMNS.forEach((c, k) => {
    for (let i = 0; i < count; i++) values[c][from + i] = interleaved[RANGE_COLUMNS.length * i + k];
  });
}

/** "YYYY-MM-DD" of a UTC millisecond timestamp. */
export const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `day` ("YYYY-MM-DD") plus `n` days. */
export const addDays = (day: string, n: number): string => isoDay(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000);

/** First and last day (inclusive) of a UTC calendar month; `month` is 1..12. */
export function monthRange(year: number, month: number): {start: string; end: string} {
  const start = isoDay(Date.UTC(year, month - 1, 1));
  return {start, end: isoDay(Date.UTC(year, month, 1) - 86_400_000)};
}

/** The "next lunar month from start": 30 whole days (a synodic month is 29.53 d) starting at `start`. */
export const lunarMonthEnd = (start: string): string => addDays(start, 29);

/** Messages from the page to a worker. All buffers are transferred. */
export interface WorkerJob {
  type: 'run';
  startIndex: number;
  endIndex: number;
  step_s: number;
  /** Rows [startIndex, endIndex) of the ephemeris only, n x 5 */
  table: Float32Array;
  /** This block's cells: lat, lon, height (m) */
  lat_deg: Float64Array;
  lon_deg: Float64Array;
  height_m: Float64Array;
  /** This block's horizon rows, count x 360, centi-degrees */
  horizons_cdeg: Int16Array;
}

/** Messages from a worker. `done.metrics` is interleaved, 4 per cell of the block. */
export type WorkerMessage = {type: 'progress'; done: number} | {type: 'done'; metrics: Float64Array};
