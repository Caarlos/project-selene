// Data loading (PLAN.md section 6): index -> manifest -> cells, plus lazy horizons and ephemeris tables.
// Every failure throws an Error whose message is shown to the user as is.
import {getResolution, isValidCell} from 'h3-js';
import {cellPolygon_m} from './projection';
import {parseCells, parseManifest, type Cells, type GridInfo, type Manifest, type ScenarioIndexEntry} from './types';

/** Azimuths per horizon row (0..359 deg). */
export const HORIZON_AZIMUTHS = 360;
/** Columns per ephemeris row: sub-solar lon, lat, sub-Earth lon, lat (deg), Earth-Moon distance (km). */
export const EPHEMERIS_COLUMNS = 5;

export interface Scenario {
  manifest: Manifest;
  /** Absolute URL of manifest.json; every file named in the manifest resolves against it. */
  manifestUrl: string;
  /** The overview grid (`manifest.grids[0]`) that `cells` and `polygons_m` describe. */
  grid: GridInfo;
  cells: Cells;
  /** Per cell, row order as `cells`: outline in projection metres, flat [x0, y0, x1, y1, ...]. */
  polygons_m: number[][];
  hillshadeUrl: string;
}

/** Best-point horizon profiles of one grid. */
export interface Horizons {
  /** Rows present in the file (`horizons_n_cells`, or `n_cells` when absent). */
  n_rows: number;
  /** Horizon elevation of cell `row` at azimuth 0..359 deg, unit 0.01 deg; null when the file has no such row. */
  row_cdeg(row: number): Int16Array | null;
}

export interface Ephemeris {
  /** UTC, ISO 8601: time of row 0 */
  t0: string;
  step_s: number;
  n: number;
  /** n x 5, row-major: sub-solar lon_deg, lat_deg, sub-Earth lon_deg, lat_deg, Earth-Moon distance_km */
  table: Float32Array;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

async function fetchOk(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`${url}: network error`);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchOk(url);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url}: not valid JSON`);
  }
}

/** Guard for `data/index.json`. */
export function parseIndex(doc: unknown): ScenarioIndexEntry[] {
  const ok =
    Array.isArray(doc) &&
    doc.length > 0 &&
    doc.every((e) => typeof e?.id === 'string' && typeof e?.manifest === 'string');
  if (!ok) throw new Error('index.json lists no scenario (expected [{id, manifest}, ...])');
  return doc as ScenarioIndexEntry[];
}

/** The entry with `scenarioId`, or the first one when no id is asked for. */
export function pickScenario(index: ScenarioIndexEntry[], scenarioId: string | null): ScenarioIndexEntry {
  if (scenarioId === null) return index[0];
  const entry = index.find((e) => e.id === scenarioId);
  if (!entry) {
    throw new Error(`Unknown scenario "${scenarioId}". Available: ${index.map((e) => e.id).join(', ')}`);
  }
  return entry;
}

/** Cells must be `n_cells` distinct valid H3 indexes of the grid's resolution (D-02). */
export function assertCellSet(cells: Cells, grid: GridInfo): void {
  if (cells.h3.length !== grid.n_cells) {
    throw new Error(`grid ${grid.id}: ${cells.h3.length} cells, manifest says ${grid.n_cells}`);
  }
  const bad = cells.h3.find((id) => !isValidCell(id) || getResolution(id) !== grid.res);
  if (bad !== undefined) throw new Error(`grid ${grid.id}: "${bad}" is not an H3 cell of resolution ${grid.res}`);
  if (new Set(cells.h3).size !== grid.n_cells) throw new Error(`grid ${grid.id}: duplicate H3 cells`);
}

/**
 * Loads index.json, the chosen manifest and the cells of its overview grid, and projects the cell outlines.
 * `dataUrl` is the absolute URL of the `data/` directory (trailing slash).
 */
export async function loadScenario(dataUrl: string, scenarioId: string | null): Promise<Scenario> {
  const entry = pickScenario(parseIndex(await fetchJson(new URL('index.json', dataUrl).href)), scenarioId);
  const manifestUrl = new URL(entry.manifest, dataUrl).href;
  const manifest = parseManifest(await fetchJson(manifestUrl));
  const grid = manifest.grids[0];
  const cells = parseCells(await fetchJson(new URL(grid.cells, manifestUrl).href), grid.n_cells);
  assertCellSet(cells, grid);
  return {
    manifest,
    manifestUrl,
    grid,
    cells,
    polygons_m: cells.h3.map(cellPolygon_m),
    hillshadeUrl: new URL(manifest.hillshade.file, manifestUrl).href,
  };
}

/** Decodes `horizons_<grid>.bin` (Int16 LE, rows x 360, 0.01 deg). Throws when the size does not match the manifest. */
export function decodeHorizons(buf: ArrayBuffer, grid: GridInfo): Horizons {
  const n_rows = grid.horizons_n_cells ?? grid.n_cells;
  const expected = n_rows * HORIZON_AZIMUTHS * 2;
  if (buf.byteLength !== expected) {
    throw new Error(
      `${grid.horizons}: ${buf.byteLength} bytes, expected ${expected} (${n_rows} cells x ${HORIZON_AZIMUTHS} azimuths x 2 bytes)`,
    );
  }
  let data: Int16Array;
  if (LITTLE_ENDIAN) data = new Int16Array(buf);
  else {
    const view = new DataView(buf);
    data = Int16Array.from({length: n_rows * HORIZON_AZIMUTHS}, (_, i) => view.getInt16(2 * i, true));
  }
  return {
    n_rows,
    row_cdeg: (row) =>
      Number.isInteger(row) && row >= 0 && row < n_rows
        ? data.subarray(row * HORIZON_AZIMUTHS, (row + 1) * HORIZON_AZIMUTHS)
        : null,
  };
}

/** Decodes the ephemeris table (Float32 LE, n x 5). Throws when the size does not match the manifest. */
export function decodeEphemeris(buf: ArrayBuffer, eph: Manifest['ephemeris']): Ephemeris {
  const expected = eph.n * EPHEMERIS_COLUMNS * 4;
  if (buf.byteLength !== expected) {
    throw new Error(
      `${eph.file}: ${buf.byteLength} bytes, expected ${expected} (${eph.n} rows x ${EPHEMERIS_COLUMNS} x 4 bytes)`,
    );
  }
  let table: Float32Array;
  if (LITTLE_ENDIAN) table = new Float32Array(buf);
  else {
    const view = new DataView(buf);
    table = Float32Array.from({length: eph.n * EPHEMERIS_COLUMNS}, (_, i) => view.getFloat32(4 * i, true));
  }
  return {t0: eph.t0, step_s: eph.step_s, n: eph.n, table};
}

// One download per file per page; a failed download is forgotten so the next call retries.
const cache = new Map<string, Promise<unknown>>();
function once<T>(url: string, decode: (buf: ArrayBuffer) => T): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetchOk(url)
      .then((res) => res.arrayBuffer())
      .then(decode);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** Lazy: horizons of the scenario's overview grid, downloaded on first call. */
export function loadHorizons(scenario: Scenario): Promise<Horizons> {
  const url = new URL(scenario.grid.horizons, scenario.manifestUrl).href;
  return once(url, (buf) => decodeHorizons(buf, scenario.grid));
}

/** Lazy: the ephemeris table named in the manifest, downloaded on first call. */
export function loadEphemeris(scenario: Scenario): Promise<Ephemeris> {
  const url = new URL(scenario.manifest.ephemeris.file, scenario.manifestUrl).href;
  return once(url, (buf) => decodeEphemeris(buf, scenario.manifest.ephemeris));
}
