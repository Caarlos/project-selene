import {describe, expect, it} from 'vitest';
import {chooseDetail, DETAIL_MIN_ZOOM, gridOfRow, hiddenRows, maskKpis, patchLabel, viewCells} from './detail';
import type {Scenario} from './loader';
import {NULLABLE_METRIC_COLUMNS, type Cells} from './types';

const patches = [{id: 'p', bounds_m: [100, 200, 300, 400] as [number, number, number, number]}];

describe('chooseDetail', () => {
  it('shows the patch only when zoomed in and the view centre is inside its bounds', () => {
    expect(chooseDetail(DETAIL_MIN_ZOOM, [200, 300], patches)).toBe('p');
    expect(chooseDetail(-3, [100, 400], patches)).toBe('p'); // edges count as inside
    expect(chooseDetail(DETAIL_MIN_ZOOM - 0.1, [200, 300], patches)).toBeNull(); // zoomed out
    expect(chooseDetail(-3, [99, 300], patches)).toBeNull(); // centre outside
    expect(chooseDetail(-3, [200, 300], [])).toBeNull();
    expect(chooseDetail(-3, [200, 300], [{id: 'no-bounds'}])).toBeNull();
    // hysteresis: once shown, the patch stays a little past the threshold
    expect(chooseDetail(DETAIL_MIN_ZOOM - 0.3, [200, 300], patches, 'p')).toBe('p');
    expect(chooseDetail(DETAIL_MIN_ZOOM - 0.6, [200, 300], patches, 'p')).toBeNull();
  });
});

// 3 overview cells (rows 0-2, row 1 under the patch) + 2 patch cells (rows 3-4)
const blank = Object.fromEntries(NULLABLE_METRIC_COLUMNS.map((c) => [c, [null, null, null, null, null]]));
const cells = {
  ...blank,
  h3: ['a', 'b', 'c', 'd', 'e'],
  lat: [-85, -89.7, -85, -89.7, -89.7],
  lon: [0, 130, 90, 130, 130],
  horizon_truncated: [false, false, false, false, false],
  sun_best_pct: [10, 20, 30, 40, 50],
  ice_index: [0, 0.5, 0, 0.9, 0],
} as unknown as Cells;
const scenario = {
  cells,
  grid: {id: 'cap', n_cells: 3},
  grids: [
    {grid: {id: 'cap', n_cells: 3}, rowStart: 0, covered: []},
    {grid: {id: 'p', n_cells: 2}, rowStart: 3, covered: [1]},
  ],
} as unknown as Scenario;

describe('views', () => {
  it('hides the covered overview rows when the patch is shown, else the patch rows', () => {
    expect(hiddenRows(scenario, 'p')).toEqual([1]);
    expect(hiddenRows(scenario, null)).toEqual([3, 4]);
  });
  it('finds the grid that holds a row (its resolution decides the base-to-ice sampling)', () => {
    expect(gridOfRow(scenario, 2).grid.id).toBe('cap');
    expect(gridOfRow(scenario, 3).grid.id).toBe('p');
    expect(gridOfRow(scenario, 4).grid.id).toBe('p');
  });
  it('blanks hidden rows, leaves the loaded cells untouched, and returns them as is when nothing is hidden', () => {
    const v = viewCells(scenario, null, [1]);
    expect(v.sun_best_pct).toEqual([10, null, 30, 40, 50]);
    expect(cells.sun_best_pct[1]).toBe(20);
    expect(v.h3).toBe(cells.h3); // geometry columns stay
    expect(viewCells(scenario, null, [])).toBe(cells);
  });
  it('NaN-masks the KPI values of blank rows', () => {
    const f = () => new Float32Array([1, 1, 1, 1, 1]);
    const k = maskKpis({values: {sun: f(), comms: f(), terrain: f(), ice: f(), protection: f()}} as never, [1, 4]);
    expect(Array.from(k.values.ice)).toEqual([1, NaN, 1, 1, NaN]);
  });
  it('labels a patch from its region key', () => {
    expect(patchLabel({id: 'shackleton_ridge', name: 'shackleton_ridge'})).toBe('Shackleton ridge');
  });
});
