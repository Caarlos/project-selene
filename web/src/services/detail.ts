// Detail patches (PLAN.md section 7.1): which grid is shown where, and the per-view cell table.
// A loaded patch adds rows to `Scenario.cells`; a view hides the rows of the grid that is not shown by nulling their
// metric columns, so legend range, KPIs, filters and ranking all ignore them with no change to their code.
import type {GridInfo} from './types';
import {NULLABLE_METRIC_COLUMNS, type Cells, type MetricColumn} from './types';
import {withRangeValues} from './customCells';
import type {Scenario} from './loader';
import {KPI_IDS} from './kpiConfig';
import type {Kpis} from './mcda';
import type {RangeValues} from './rangeProtocol';

/** Map zoom (deck.gl OrthographicView, log2 pixels per metre) from which a patch replaces the overview cells. */
export const DETAIL_MIN_ZOOM = -7;

/** The patch to show: the first one containing the view centre (projection metres) once zoomed in far enough. */
export function chooseDetail(
  zoom: number,
  centre_m: [number, number],
  patches: Pick<GridInfo, 'id' | 'bounds_m'>[],
  minZoom = DETAIL_MIN_ZOOM,
): string | null {
  if (zoom < minZoom) return null;
  const [x, y] = centre_m;
  const hit = patches.find((p) => p.bounds_m && x >= p.bounds_m[0] && x <= p.bounds_m[2] && y >= p.bounds_m[1] && y <= p.bounds_m[3]);
  return hit?.id ?? null;
}

/** Rows not shown when patch `detail` (or the overview alone when null) is displayed. */
export function hiddenRows(scenario: Scenario, detail: string | null): number[] {
  const hidden: number[] = [];
  for (const g of scenario.grids.slice(1)) {
    if (g.grid.id === detail) hidden.push(...g.covered);
    else for (let i = 0; i < g.grid.n_cells; i++) hidden.push(g.rowStart + i);
  }
  return hidden;
}

const MASKED = NULLABLE_METRIC_COLUMNS as readonly MetricColumn[];

/** Rows to blank in the current view: hidden ones, except `keep` rows (selected and pinned cells stay readable). */
export function maskedRows(scenario: Scenario, detail: string | null, keep: number[]): number[] {
  return hiddenRows(scenario, detail).filter((r) => !keep.includes(r));
}

/** The cells every reader uses: the loaded cells, with the custom-range columns when `range` is set, and `rows` blanked (null). */
export function viewCells(scenario: Scenario, range: RangeValues | null, rows: number[]): Cells {
  const base = range ? withRangeValues(scenario.cells, range) : scenario.cells;
  if (rows.length === 0) return base;
  const out: Cells = {...base};
  for (const c of MASKED) {
    const col = base[c].slice();
    for (const r of rows) col[r] = null;
    out[c] = col;
  }
  return out;
}

/** KPI values of `rows` set to NaN (the ice KPI is distance-based and would otherwise score a blank cell). */
export function maskKpis(kpis: Kpis, rows: number[]): Kpis {
  for (const k of KPI_IDS) for (const r of rows) kpis.values[k][r] = NaN;
  return kpis;
}

/** Display name of a patch: its region key with spaces ("shackleton_ridge" -> "Shackleton ridge"). */
export function patchLabel(grid: Pick<GridInfo, 'id' | 'name'>): string {
  const t = (grid.name ?? grid.id).replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
