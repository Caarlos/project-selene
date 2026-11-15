// Data loading (PLAN.md section 6): index -> manifest -> cells, plus lazy horizons and ephemeris tables.
// Every failure throws an Error whose message is shown to the user as is.
import {getResolution, isValidCell} from 'h3-js';
import {cellPolygon_m, projectStereo_m} from './projection';
import {parseCells, parseManifest, type Cells, type GridInfo, type Manifest, type ScenarioIndexEntry} from './types';

/** Azimuths per horizon row (0..359 deg). */
export const HORIZON_AZIMUTHS = 360;
/** Columns per ephemeris row: sub-solar lon, lat, sub-Earth lon, lat (deg), Earth-Moon distance (km). */
export const EPHEMERIS_COLUMNS = 5;

export interface Scenario {
  manifest: Manifest;
  /** Absolute URL of manifest.json; every file named in the manifest resolves against it. */
  manifestUrl: string;
  /** The overview grid (`manifest.grids[0]`); its cells are rows 0..n_cells-1 of `cells`. */
  grid: GridInfo;
  /** Overview cells, followed by the cells of each loaded detail patch (see `grids`). */
  cells: Cells;
  /** Per cell, row order as `cells`: outline in projection metres, flat [x0, y0, x1, y1, ...]. */
  polygons_m: number[][];
  /** Row ranges of `cells` per loaded grid: the overview first, then the loaded patches. */
  grids: LoadedGrid[];
  /** Detail patches the manifest offers (grids with `bounds_m`), loaded or not. */
  patches: GridInfo[];
  hillshadeUrl: string;
}

export interface LoadedGrid {
  grid: GridInfo;
  /** First row of this grid in `Scenario.cells`. */
  rowStart: number;
  /** Patches only: rows of the overview cells whose centre lies inside the patch square (the ones a patch replaces). */
  covered: number[];
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
    grids: [{grid, rowStart: 0, covered: []}],
    patches: manifest.grids.filter((g) => g.bounds_m),
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

/** Lazy: horizons of the overview grid and of every loaded patch (rows as `Scenario.cells`), downloaded on first call. */
export function loadHorizons(scenario: Scenario): Promise<Horizons> {
  const part = ({grid}: LoadedGrid) => once(new URL(grid.horizons, scenario.manifestUrl).href, (buf) => decodeHorizons(buf, grid));
  if (scenario.grids.length === 1) return part(scenario.grids[0]);
  return Promise.all(scenario.grids.map(part)).then((parts) => ({
    n_rows: scenario.grids[parts.length - 1].rowStart + parts[parts.length - 1].n_rows,
    row_cdeg(row) {
      let i = parts.length - 1;
      while (i > 0 && scenario.grids[i].rowStart > row) i--;
      return parts[i].row_cdeg(row - scenario.grids[i].rowStart);
    },
  }));
}

/** Pure: `scenario` with the cells of patch `grid` appended as new rows; overview rows keep their indices. */
export function withPatch(scenario: Scenario, grid: GridInfo, patch: Cells): Scenario {
  if (!grid.bounds_m) throw new Error(`grid ${grid.id} has no bounds_m: not a detail patch`);
  if (scenario.grids.some((g) => g.grid.id === grid.id)) return scenario;
  const [x0, y0, x1, y1] = grid.bounds_m;
  const covered: number[] = [];
  for (let i = 0; i < scenario.grid.n_cells; i++) {
    const [x, y] = projectStereo_m(scenario.cells.lat[i], scenario.cells.lon[i]);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) covered.push(i);
  }
  const cells = {...scenario.cells};
  for (const k of Object.keys(cells) as (keyof Cells)[]) (cells as Record<string, unknown[]>)[k] = [...scenario.cells[k], ...patch[k]];
  return {
    ...scenario,
    cells,
    polygons_m: [...scenario.polygons_m, ...patch.h3.map(cellPolygon_m)],
    grids: [...scenario.grids, {grid, rowStart: scenario.cells.h3.length, covered}],
  };
}

/** Lazy: downloads and validates the cells of a detail patch (like the overview), returns the scenario extended by them. */
export async function loadPatch(scenario: Scenario, gridId: string): Promise<Scenario> {
  const grid = scenario.patches.find((g) => g.id === gridId);
  if (!grid) throw new Error(`Unknown detail patch "${gridId}"`);
  const cells = await once(new URL(grid.cells, scenario.manifestUrl).href, (buf) => {
    let doc: unknown;
    try {
      doc = JSON.parse(new TextDecoder().decode(buf));
    } catch {
      throw new Error(`${grid.cells}: not valid JSON`);
    }
    const parsed = parseCells(doc, grid.n_cells);
    assertCellSet(parsed, grid);
    return parsed;
  });
  return withPatch(scenario, grid, cells);
}

/** Lazy: the ephemeris table named in the manifest, downloaded on first call. */
export function loadEphemeris(scenario: Scenario): Promise<Ephemeris> {
  const url = new URL(scenario.manifest.ephemeris.file, scenario.manifestUrl).href;
  return once(url, (buf) => decodeEphemeris(buf, scenario.manifest.ephemeris));
}
