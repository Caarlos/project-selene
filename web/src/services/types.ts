// Data contract types (PLAN.md section 6). Mirror of pipeline/schema/*.schema.json: change both together.

export const SCHEMA_VERSION = 1;

/** One entry of `data/index.json`; `manifest` is relative to the `data/` directory. */
export interface ScenarioIndexEntry {
  id: string;
  manifest: string;
}

export interface GridInfo {
  id: string;
  /** H3 resolution */
  res: number;
  n_cells: number;
  /** `cells_<grid>.json`, relative to the scenario directory */
  cells: string;
  /** Int16 LE, rows x 360 (azimuth 0..359 deg), unit 0.01 deg, row order as cells */
  horizons: string;
  /** Placeholder fixtures only: the horizons file covers the first rows only. Absent = n_cells. */
  horizons_n_cells?: number;
  /** Detail patches only: region key of pipeline/regions.json */
  name?: string;
  /** Detail patches only: [x_min, y_min, x_max, y_max] of the patch square, projection metres. Absent = overview grid. */
  bounds_m?: [number, number, number, number];
}

export interface Manifest {
  schema_version: typeof SCHEMA_VERSION;
  scenario_id: string;
  /** true = not real data: show the permanent "synthetic data" banner */
  synthetic: boolean;
  /** UTC, ISO 8601 */
  generated_at: string;
  region: {name: string; lat_max: number};
  /** UTC, ISO 8601; `end` is exclusive */
  time: {start: string; end: string; step_s: number};
  params: {
    az_step_deg: number;
    range_km: number;
    observer_height_m: number;
    safe_slope_deg: number;
    samples_per_cell: number;
    slope_baseline_m: number;
    ice_source: string;
  };
  sources: {name: string; url: string; sha256: string}[];
  projection: {type: 'south_polar_stereographic'; radius_m: number};
  /** `bounds_m` = [x_min, y_min, x_max, y_max] in projection metres */
  hillshade: {file: string; bounds_m: [number, number, number, number]};
  /** Float32 LE, n rows x 5: sub-solar lon, lat, sub-Earth lon, lat (deg), Earth-Moon distance (km) */
  ephemeris: {file: string; t0: string; step_s: number; n: number};
  grids: GridInfo[];
  notes?: string[];
}

/** Numeric columns of `cells_<grid>.json` that may hold null (value unavailable). */
export const NULLABLE_METRIC_COLUMNS = [
  'elev_m',
  'best_lat',
  'best_lon',
  'sun_best_pct',
  'sun_mean_pct',
  'dark_max_h_best',
  'dark_max_h_mean',
  'earth_best_pct',
  'earth_mean_pct',
  'earth_outage_max_h_best',
  'svf',
  'slope_mean_deg',
  'slope_p95_deg',
  'safe_frac',
  'tri_m',
  'tmax_k',
  'tavg_k',
  'thermal_amp_k',
  'psr_frac',
  'ice_index',
] as const;

export type MetricColumn = (typeof NULLABLE_METRIC_COLUMNS)[number];

/** Columnar: every array has length n_cells, same row order. */
export type Cells = {
  h3: string[];
  /** deg, cell centre */
  lat: number[];
  /** deg, east-positive, (-180, 180] */
  lon: number[];
  horizon_truncated: boolean[];
} & Record<MetricColumn, (number | null)[]>;

const CELL_COLUMNS = ['h3', 'lat', 'lon', 'horizon_truncated', ...NULLABLE_METRIC_COLUMNS] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Runtime guard for `manifest.json`. Throws an Error with a readable message. */
export function parseManifest(doc: unknown): Manifest {
  if (!isObject(doc)) throw new Error('manifest.json is not a JSON object');
  if (doc.schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported data schema_version ${JSON.stringify(doc.schema_version)}: this app reads version ` +
        `${SCHEMA_VERSION}. Rebuild the scenario with the matching pipeline version.`,
    );
  }
  const bad: string[] = [];
  const expect = (path: string, ok: boolean) => ok || bad.push(path);
  const str = (v: unknown) => typeof v === 'string';
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const sub = (key: string) => (isObject(doc[key]) ? doc[key] : {});

  expect('scenario_id', str(doc.scenario_id));
  expect('synthetic', typeof doc.synthetic === 'boolean');
  expect('generated_at', str(doc.generated_at));
  expect('region', str(sub('region').name) && num(sub('region').lat_max));
  const time = sub('time');
  expect('time', str(time.start) && str(time.end) && num(time.step_s));
  const params = sub('params');
  for (const k of ['az_step_deg', 'range_km', 'observer_height_m', 'safe_slope_deg', 'samples_per_cell', 'slope_baseline_m']) {
    expect(`params.${k}`, num(params[k]));
  }
  expect('params.ice_source', str(params.ice_source));
  expect('sources', Array.isArray(doc.sources));
  expect('projection', sub('projection').type === 'south_polar_stereographic' && num(sub('projection').radius_m));
  const bounds = sub('hillshade').bounds_m;
  expect('hillshade', str(sub('hillshade').file) && Array.isArray(bounds) && bounds.length === 4 && bounds.every(num));
  const eph = sub('ephemeris');
  expect('ephemeris', str(eph.file) && str(eph.t0) && num(eph.step_s) && num(eph.n));
  const grids = Array.isArray(doc.grids) ? doc.grids : [];
  expect('grids', grids.length > 0);
  grids.forEach((g, i) =>
    expect(
      `grids[${i}]`,
      isObject(g) && str(g.id) && num(g.res) && num(g.n_cells) && str(g.cells) && str(g.horizons) &&
        (g.horizons_n_cells === undefined || num(g.horizons_n_cells)) &&
        (g.name === undefined || str(g.name)) &&
        (g.bounds_m === undefined || (Array.isArray(g.bounds_m) && g.bounds_m.length === 4 && g.bounds_m.every(num))),
    ),
  );
  if (bad.length) throw new Error(`manifest.json: missing or invalid field(s): ${bad.join(', ')}`);
  return doc as unknown as Manifest;
}

/** Runtime guard for `cells_<grid>.json`: every column present with exactly `nCells` values. */
export function parseCells(doc: unknown, nCells: number): Cells {
  if (!isObject(doc)) throw new Error('cells file is not a JSON object');
  const bad = CELL_COLUMNS.filter((k) => !Array.isArray(doc[k]) || doc[k].length !== nCells);
  if (bad.length) throw new Error(`cells file: column(s) missing or not of length ${nCells}: ${bad.join(', ')}`);
  return doc as unknown as Cells;
}
