import {describe, expect, it} from 'vitest';
import {countMissing, withRangeValues} from './customCells';
import {FILTER_CONFIG} from './kpiConfig';
import {computeKpis, filtersInto} from './mcda';
import {emptyRangeValues} from './rangeProtocol';
import {defaultFilters, useStore} from './store';
import {NULLABLE_METRIC_COLUMNS, type Cells} from './types';

function makeCells(): Cells {
  const n = 3;
  const cells = {
    h3: ['a', 'b', 'c'],
    lat: [-85, -86, -87],
    lon: [0, 0, 0],
    horizon_truncated: [false, false, false],
  } as unknown as Cells;
  for (const k of NULLABLE_METRIC_COLUMNS) cells[k] = new Array<number | null>(n).fill(null);
  cells.sun_best_pct = [50, 60, 70];
  cells.earth_best_pct = [10, 20, 30];
  cells.sun_mean_pct = [1, 2, 3];
  cells.dark_max_h_best = [10, 10, 10];
  return cells;
}

describe('custom-range override read path', () => {
  const base = makeCells();
  const values = emptyRangeValues(3);
  values.sun_best_pct.set([100, 0, NaN]);
  values.earth_best_pct.set([5, 50, NaN]);
  values.dark_max_h_best.set([500, 5, NaN]);

  it('replaces the four columns, shares the others and never mutates the baseline', () => {
    const eff = withRangeValues(base, values);
    expect(eff.sun_best_pct).toEqual([100, 0, null]);
    expect(eff.earth_best_pct).toEqual([5, 50, null]);
    expect(eff.dark_max_h_best).toEqual([500, 5, null]);
    expect(eff.sun_mean_pct).toBe(base.sun_mean_pct);
    expect(base.sun_best_pct).toEqual([50, 60, 70]);
    expect(countMissing(values)).toBe(1);
  });

  it('KPIs and filters follow the override and revert on baseline', () => {
    const eff = withRangeValues(base, values);
    expect(Array.from(computeKpis(eff).values.sun)).toEqual([1, 0, NaN]);
    expect(Array.from(computeKpis(base).values.sun).map((v) => +v.toFixed(2))).toEqual([0.5, 0.6, 0.7]);
    const f = defaultFilters();
    f.dark_max_h_best = {enabled: true, limit: 100}; // max filter
    expect(FILTER_CONFIG.dark_max_h_best.kind).toBe('max');
    const out = new Uint8Array(3);
    filtersInto(eff, f, out);
    expect(Array.from(out)).toEqual([1, 0, 0]); // null never excluded
    filtersInto(base, f, out);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });

  it('store: clearCustomRange restores the baseline cells and KPIs', () => {
    const kpis = computeKpis(base);
    const eff = withRangeValues(base, values);
    useStore.setState({
      scenario: {cells: base, grids: []} as never,
      cells: eff,
      kpis: computeKpis(eff),
      baselineKpis: kpis,
      customRange: {startIndex: 0, endIndex: 24},
      customMissing: 1,
      mcdaScore: new Float32Array(3),
      excluded: new Uint8Array(3),
      score: new Float32Array(3),
    });
    useStore.getState().clearCustomRange();
    const s = useStore.getState();
    expect(s.customRange).toBeNull();
    expect(s.cells).toBe(base);
    expect(s.kpis).toEqual(kpis);
    expect(s.customMissing).toBe(0);
  });
});
