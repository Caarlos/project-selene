// Store behaviour with a detail patch: hidden cells never leak into results; a requested date range survives a patch load.
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {topCells} from './mcda';
import {emptyRangeValues} from './rangeProtocol';
import type {Scenario} from './loader';
import {kpisFor, scoreFor, useStore} from './store';
import {NULLABLE_METRIC_COLUMNS, type Cells} from './types';

const startRangeJob = vi.hoisted(() => vi.fn());
const loadPatch = vi.hoisted(() => vi.fn());
vi.mock('./rangeRunner', () => ({startRangeJob}));
vi.mock('./loader', async (orig) => ({
  ...(await orig<typeof import('./loader')>()),
  loadPatch,
  loadHorizons: async () => ({n_rows: 0, row_cdeg: () => null}),
  loadEphemeris: async () => ({t0: '2027-01-01T00:00:00Z', step_s: 3600, n: 100, table: new Float32Array(500)}),
}));

// Rows 0-2 overview (row 1 lies under the patch and is the only ice-bearing, best-sunlit cell), rows 3-4 patch cells.
const LAT = [-85, -86, -87, -86.01, -85.99];
function cells(rows: number): Cells {
  const c = {h3: LAT.slice(0, rows).map((_, i) => `c${i}`), lat: LAT.slice(0, rows), lon: LAT.slice(0, rows).map(() => 0),
    horizon_truncated: LAT.slice(0, rows).map(() => false)} as unknown as Cells;
  for (const k of NULLABLE_METRIC_COLUMNS) c[k] = LAT.slice(0, rows).map((_, i) => (k === 'ice_index' ? (i === 1 ? 0.9 : 0) : 10 + 20 * i));
  c.sun_best_pct = LAT.slice(0, rows).map((_, i) => (i === 1 ? 99 : 10 + i));
  return c;
}
const patchGrid = {id: 'p', res: 7, n_cells: 2, cells: '', horizons: '', bounds_m: [0, 0, 1, 1] as [number, number, number, number]};
function scenario(withPatch: boolean): Scenario {
  const grids = [{grid: {id: 'cap', res: 5, n_cells: 3}, rowStart: 0, covered: []}] as unknown as Scenario['grids'];
  if (withPatch) grids.push({grid: patchGrid, rowStart: 3, covered: [1]});
  return {cells: cells(withPatch ? 5 : 3), grid: grids[0].grid, grids, patches: [patchGrid]} as unknown as Scenario;
}
function install(s: Scenario) {
  const n = s.cells.h3.length;
  useStore.setState({scenario: s, cells: s.cells, fullCells: s.cells, kpis: null, shadow: null, detail: null, selected: null,
    pinned: [], customRange: null, customValues: null, score: new Float32Array(n), mcdaScore: new Float32Array(n), excluded: new Uint8Array(n)});
}

describe('hidden cells', () => {
  beforeEach(() => install(scenario(true)));

  it('an overview cell selected before zooming in is not ranked, not an ice target, but still readable', async () => {
    useStore.getState().select(1);
    await useStore.getState().showDetail('p'); // patch rows already loaded: row 1 is now hidden
    const s = useStore.getState();
    expect(s.cells!.sun_best_pct[1]).toBeNull();
    expect(topCells(s.mcdaScore, s.excluded, 10)).not.toContain(1);
    expect(Array.from(s.kpis!.nearestIce)).not.toContain(1);
    expect(s.range).toBeNull(); // colour by score
    useStore.getState().setColourBy('sun_best_pct');
    expect(useStore.getState().range!.max).toBeLessThan(99); // the hidden 99 is not in the legend range
    // ... while the inspector reads the unmasked table
    expect(s.fullCells!.sun_best_pct[1]).toBe(99);
    expect(Number.isNaN(scoreFor(s, 1))).toBe(false);
    expect(kpisFor(s, 1)!.values.sun[1]).toBeCloseTo(0.99);
    expect(kpisFor(s, 0)).toBe(s.kpis); // visible cells use the ranked KPIs
  });

  it('a patch cell pinned before zooming out is not ranked, not an ice target, but still readable', async () => {
    useStore.getState().togglePin(4);
    await useStore.getState().showDetail('p');
    await useStore.getState().showDetail(null);
    const s = useStore.getState();
    expect(topCells(s.mcdaScore, s.excluded, 10)).not.toContain(4);
    expect(Array.from(s.kpis!.nearestIce)).not.toContain(4);
    expect(s.fullCells!.sun_best_pct[4]).toBe(s.cells!.sun_best_pct[4] ?? 10 + 4);
    expect(Number.isNaN(scoreFor(s, 4))).toBe(false);
    // a later selection change updates what is exempt
    useStore.getState().togglePin(4);
    expect(useStore.getState().shadow).toBeNull();
  });
});

describe('a requested date range survives the patch load', () => {
  it('reruns the range still being computed, over all rows, and ends custom', async () => {
    install(scenario(false));
    const done: ((v: ReturnType<typeof emptyRangeValues>) => void)[] = [];
    startRangeJob.mockImplementation(() => ({cancel: vi.fn(), done: new Promise((r) => done.push(r))}));
    let release!: () => void;
    loadPatch.mockImplementation(() => new Promise((r) => (release = () => r(scenario(true)))));

    void useStore.getState().applyCustomRange(0, 24);
    await vi.waitFor(() => expect(startRangeJob).toHaveBeenCalledTimes(1));
    expect(startRangeJob.mock.calls[0][0].nCells).toBe(3);
    const shown = useStore.getState().showDetail('p'); // zoom in while the job is still running
    release();
    await shown;
    await vi.waitFor(() => expect(startRangeJob).toHaveBeenCalledTimes(2));
    const second = startRangeJob.mock.calls[1][0];
    expect([second.startIndex, second.endIndex, second.nCells]).toEqual([0, 24, 5]);
    done[1](emptyRangeValues(5));
    await vi.waitFor(() => expect(useStore.getState().customRange).toEqual({startIndex: 0, endIndex: 24}));
    expect(useStore.getState().customValues!.sun_best_pct).toHaveLength(5);
  });
});
