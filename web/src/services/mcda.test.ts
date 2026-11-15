import {describe, expect, it} from 'vitest';
import {MISSION_PRESETS} from '../components/artemis/presets';
import {DEFAULT_KPI_SETTINGS, FILTER_IDS, KPI_IDS} from './kpiConfig';
import {computeKpis, effectiveSettings, filtersInto, nearestIceCells, scoreInto, topCells, weightShares, type Weights} from './mcda';
import {surfaceDistance_m} from './projection';
import {defaultFilters, useStore} from './store';
import {NULLABLE_METRIC_COLUMNS, type Cells} from './types';

type Overrides = Partial<Record<(typeof NULLABLE_METRIC_COLUMNS)[number], (number | null)[]>>;

/** Cells at the given latitudes, all on lon 0 (so 1 deg = 30.325 km), metrics from `o`, null otherwise. */
function makeCells(lat: number[], o: Overrides): Cells {
  const n = lat.length;
  const cells = {
    h3: lat.map((_, i) => `c${i}`),
    lat,
    lon: lat.map(() => 0),
    horizon_truncated: lat.map(() => false),
  } as unknown as Cells;
  for (const k of NULLABLE_METRIC_COLUMNS) cells[k] = o[k] ?? new Array<number | null>(n).fill(null);
  return cells;
}

const W = (sun = 0, comms = 0, terrain = 0, ice = 0, protection = 0): Weights => ({sun, comms, terrain, ice, protection});

describe('KPI formulas', () => {
  const cells = makeCells([-85, -85.2, -86], {
    sun_best_pct: [50, 100, 0],
    earth_best_pct: [25, 150, null], // 150 is out of range: clamped
    safe_frac: [0.8, 1, 0],
    svf: [0.9, 0.75, 1], // shielding (1-svf)/0.25 = 0.4, 1, 0
    ice_index: [0.5, 0.1, 0.19],
  });
  const k = computeKpis(cells);
  it('matches hand values', () => {
    expect(Array.from(k.values.sun)).toEqual([0.5, 1, 0]);
    expect(k.values.comms[0]).toBeCloseTo(0.25);
    expect(k.values.comms[1]).toBe(1);
    expect(k.values.comms[2]).toBeNaN();
    expect(k.values.terrain[0]).toBeCloseTo(0.8);
    expect(k.values.protection[0]).toBeCloseTo(0.4);
    expect(k.values.protection[1]).toBeCloseTo(1);
    expect(k.values.protection[2]).toBe(0);
  });
  it('ice: 1 in an ice cell, linear to 0 at 30 km, 0 beyond, threshold 0.2 inclusive', () => {
    expect(k.values.ice[0]).toBe(1);
    const d = surfaceDistance_m(-85.2, 0, -85, 0); // 0.2 deg = 6.065 km
    expect(k.nearestIce[1]).toBe(0);
    expect(k.nearestIceDistance_m[1]).toBeCloseTo(d, 0);
    expect(k.values.ice[1]).toBeCloseTo(1 - d / 30_000, 5);
    expect(k.values.ice[2]).toBe(0); // 1 deg = 30.3 km away; 0.19 < 0.2 does not qualify
    const edge = computeKpis(makeCells([-85], {ice_index: [0.2]}));
    expect(edge.values.ice[0]).toBe(1);
  });
  it('all-null inputs make a KPI unavailable', () => {
    const none = computeKpis(makeCells([-85, -86], {sun_best_pct: [10, 20]}));
    expect(none.available).toEqual({sun: true, comms: false, terrain: false, ice: false, protection: false});
  });
  it('no ice cell at all: ice KPI is 0 and no nearest index', () => {
    const r = computeKpis(makeCells([-85, -86], {ice_index: [0.1, 0]}));
    expect(r.available.ice).toBe(true);
    expect(Array.from(r.values.ice)).toEqual([0, 0]);
    expect(Array.from(r.nearestIce)).toEqual([-1, -1]);
  });
});

describe('nearestIceCells', () => {
  it('matches brute force on a hand-made scatter, including far-away ice', () => {
    const lat: number[] = [];
    const lon: number[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      lat.push(-90 + rnd() * 10);
      lon.push(rnd() * 360 - 180);
    }
    const isIce = lat.map((_, i) => i % 97 === 0);
    const {index, distance_m} = nearestIceCells(lat, lon, isIce);
    for (let i = 0; i < lat.length; i++) {
      let best = Infinity;
      for (let j = 0; j < lat.length; j++) if (isIce[j]) best = Math.min(best, surfaceDistance_m(lat[i], lon[i], lat[j], lon[j]));
      expect(distance_m[i]).toBeCloseTo(best, -1);
      expect(isIce[index[i]]).toBe(true);
    }
  });
});

describe('score', () => {
  const cells = makeCells([-85, -86], {
    sun_best_pct: [100, 0],
    earth_best_pct: [0, 100],
    safe_frac: [1, 1],
  });
  const k = computeKpis(cells);
  const out = new Float32Array(2);
  it('is the weighted mean, renormalised over available KPIs only', () => {
    // ice and protection are unavailable: their weights must not count
    expect(scoreInto(k, W(3, 1, 0, 50, 50), out)).toBe('ok');
    expect(out[0]).toBeCloseTo(0.75);
    expect(out[1]).toBeCloseTo(0.25);
    scoreInto(k, W(1, 1, 2, 9, 9), out);
    expect(out[0]).toBeCloseTo(0.75);
    expect(out[1]).toBeCloseTo(0.75);
  });
  it('shares ignore unavailable KPIs', () => {
    const s = weightShares(W(1, 1, 2, 40, 40), k.available);
    expect(s.sun).toBeCloseTo(0.25);
    expect(s.terrain).toBeCloseTo(0.5);
    expect(s.ice).toBe(0);
  });
  it('all-zero weights (also when only unavailable KPIs have weight) give the neutral score and a hint', () => {
    expect(scoreInto(k, W(), out)).toBe('zero-weights');
    expect(Array.from(out)).toEqual([0.5, 0.5]);
    expect(scoreInto(k, W(0, 0, 0, 80, 80), out)).toBe('zero-weights');
  });
  it('a null KPI of one cell drops out of that cell only', () => {
    const c = computeKpis(makeCells([-85, -86], {sun_best_pct: [100, 0], earth_best_pct: [null, 100]}));
    scoreInto(c, W(1, 1), out);
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(0.5);
  });
});

describe('hard filters', () => {
  const cells = makeCells([-85, -85, -85, -85], {
    safe_frac: [0.4, 0.6, null, 0.5],
    slope_p95_deg: [20, 10, null, 15],
    dark_max_h_best: [200, 100, null, 150],
    earth_best_pct: [40, 60, null, 50],
  });
  const out = new Uint8Array(4);
  const on = (id: (typeof FILTER_IDS)[number], limit: number) => {
    const f = defaultFilters();
    f[id] = {enabled: true, limit};
    return f;
  };
  it('each filter alone: min and max are inclusive, null is never excluded', () => {
    expect(filtersInto(cells, on('safe_frac', 0.5), out)).toBe(1);
    expect(Array.from(out)).toEqual([1, 0, 0, 0]);
    expect(filtersInto(cells, on('slope_p95_deg', 15), out)).toBe(1);
    expect(Array.from(out)).toEqual([1, 0, 0, 0]);
    expect(filtersInto(cells, on('dark_max_h_best', 150), out)).toBe(1);
    expect(Array.from(out)).toEqual([1, 0, 0, 0]);
    expect(filtersInto(cells, on('earth_best_pct', 50), out)).toBe(1);
    expect(Array.from(out)).toEqual([1, 0, 0, 0]);
  });
  it('disabled filters exclude nothing; enabled ones combine', () => {
    expect(filtersInto(cells, defaultFilters(), out)).toBe(0);
    const f = on('safe_frac', 0.55);
    f.slope_p95_deg = {enabled: true, limit: 12};
    expect(filtersInto(cells, f, out)).toBe(2);
    expect(Array.from(out)).toEqual([1, 0, 0, 1]);
  });
});

describe('topCells', () => {
  it('ranks by score, skips excluded and NaN, keeps at most n', () => {
    const score = Float32Array.from([0.1, 0.9, NaN, 0.5, 0.95, 0.7]);
    const ex = Uint8Array.from([0, 0, 0, 0, 1, 0]);
    expect(topCells(score, ex, 3)).toEqual([1, 5, 3]);
    expect(topCells(score, ex, 10)).toEqual([1, 5, 3, 0]);
  });
});

describe('store: presets and recompute', () => {
  const n = 2;
  const cells = makeCells([-85, -86], {
    sun_best_pct: [100, 0],
    earth_best_pct: [60, 40],
    safe_frac: [1, 0.5],
    slope_p95_deg: [5, 12],
    svf: [0.8, 0.9],
    ice_index: [0.5, 0],
  });
  const seed = () => {
    useStore.setState({
      scenario: {cells, grid: {n_cells: n}} as never,
      kpis: computeKpis(cells),
      score: new Float32Array(n),
      mcdaScore: new Float32Array(n),
      excluded: new Uint8Array(n),
      colourBy: 'score',
    });
    useStore.getState().resetMcda();
  };

  it.each(MISSION_PRESETS)('$label reproduces the PLAN.md table', (p) => {
    seed();
    useStore.getState().applyPreset(p.id);
    const {weights, filters} = useStore.getState();
    for (const k of KPI_IDS) expect(weights[k] / 100).toBeCloseTo(p.weights[k]);
    for (const id of FILTER_IDS) {
      expect(filters[id].enabled).toBe(p.filters[id] !== undefined);
      if (p.filters[id] !== undefined) expect(filters[id].limit).toBe(p.filters[id]);
    }
  });
  it('matches the table literally', () => {
    const t = (id: string) => MISSION_PRESETS.find((p) => p.id === id)!;
    expect(t('artemis4').weights).toEqual({sun: 0.3, comms: 0.3, terrain: 0.3, ice: 0.05, protection: 0.05});
    expect(t('artemis4').filters).toEqual({slope_p95_deg: 10, earth_best_pct: 50});
    expect(t('clps').weights).toEqual({sun: 0.15, comms: 0.15, terrain: 0.2, ice: 0.5, protection: 0});
    expect(t('clps').filters).toEqual({slope_p95_deg: 15});
    expect(t('basecamp').weights).toEqual({sun: 0.3, comms: 0.15, terrain: 0.15, ice: 0.25, protection: 0.15});
    expect(t('basecamp').filters).toEqual({dark_max_h_best: 150});
  });
  it('a preset recomputes score, excluded count and colours in place', () => {
    seed();
    const {score, excluded} = useStore.getState();
    const v0 = useStore.getState().colourVersion;
    useStore.getState().applyPreset('artemis4'); // slope_p95 <= 10 excludes cell 1; earth >= 50 excludes cell 1
    expect(useStore.getState().score).toBe(score);
    expect(useStore.getState().excluded).toBe(excluded);
    expect(Array.from(excluded)).toEqual([0, 1]);
    expect(useStore.getState().excludedCount).toBe(1);
    expect(useStore.getState().colourVersion).toBeGreaterThan(v0);
    expect(score[0]).toBeCloseTo(useStore.getState().mcdaScore[0]);
  });
});

describe('editable reference values and basis (W8)', () => {
  // cells 0.5 deg (about 15 km) apart on lon 0; only the first bears ice
  const cells = makeCells([-85, -85.5], {
    ice_index: [0.5, 0],
    svf: [0.9, 0.9],
    sun_best_pct: [80, 80],
    sun_mean_pct: [20, 40],
    earth_best_pct: [90, 90],
    earth_mean_pct: [10, 30],
  });
  const d_km = surfaceDistance_m(-85.5, 0, -85, 0) / 1000;

  it('iceDistanceScale_km and shieldingScale change kpi_ice and kpi_protection as in PLAN 7.2', () => {
    const k = computeKpis(cells, {...DEFAULT_KPI_SETTINGS, iceDistanceScale_km: 20, shieldingScale: 0.5});
    expect(k.values.ice[0]).toBe(1);
    expect(k.values.ice[1]).toBeCloseTo(1 - d_km / 20, 5);
    expect(k.values.protection[0]).toBeCloseTo((1 - 0.9) / 0.5, 5);
    const d = computeKpis(cells);
    expect(d.values.ice[1]).toBeCloseTo(1 - d_km / 30, 5);
    expect(d.values.protection[0]).toBeCloseTo(0.4, 5);
  });

  it('iceIndexMin decides which cells bear ice', () => {
    const k = computeKpis(cells, {...DEFAULT_KPI_SETTINGS, iceIndexMin: 0.9});
    expect(Array.from(k.nearestIce)).toEqual([-1, -1]);
    expect(k.values.ice[0]).toBe(0);
  });

  it('mean basis reads the mean columns; best is the default', () => {
    const best = computeKpis(cells);
    expect(best.values.sun[1]).toBeCloseTo(0.8);
    const mean = computeKpis(cells, {...DEFAULT_KPI_SETTINGS, sunCommsBasis: 'mean'});
    expect(Array.from(mean.values.sun).map((v) => +v.toFixed(2))).toEqual([0.2, 0.4]);
    expect(Array.from(mean.values.comms).map((v) => +v.toFixed(2))).toEqual([0.1, 0.3]);
  });

  it('a custom range falls back to the best point', () => {
    const mean = {...DEFAULT_KPI_SETTINGS, sunCommsBasis: 'mean'} as const;
    expect(effectiveSettings(mean, true).sunCommsBasis).toBe('best');
    expect(effectiveSettings(mean, false).sunCommsBasis).toBe('mean');
  });

  it('the store recomputes KPIs when a setting changes', () => {
    useStore.setState({scenario: {grid: {n_cells: 2}, cells, grids: []} as never, cells, kpis: null, customRange: null});
    useStore.setState({mcdaScore: new Float32Array(2), excluded: new Uint8Array(2), score: new Float32Array(2)});
    useStore.getState().setKpiSettings({iceDistanceScale_km: 20});
    expect(useStore.getState().kpis!.values.ice[1]).toBeCloseTo(1 - d_km / 20, 5);
    useStore.getState().resetKpiSettings();
    expect(useStore.getState().kpis!.values.ice[1]).toBeCloseTo(1 - d_km / 30, 5);
    useStore.setState({customRange: {startIndex: 0, endIndex: 1}});
    useStore.getState().setKpiSettings({sunCommsBasis: 'mean'});
    expect(useStore.getState().kpis!.values.sun[1]).toBeCloseTo(0.8); // custom: best point
    useStore.setState({customRange: null});
    useStore.getState().resetKpiSettings();
  });

  it('settings changed during a custom range apply after clearCustomRange', () => {
    useStore.setState({scenario: {grid: {n_cells: 2}, cells, grids: []} as never, cells, kpis: null, customRange: {startIndex: 0, endIndex: 1}});
    useStore.setState({mcdaScore: new Float32Array(2), excluded: new Uint8Array(2), score: new Float32Array(2)});
    useStore.getState().setKpiSettings({iceDistanceScale_km: 20, sunCommsBasis: 'mean'});
    useStore.getState().clearCustomRange();
    const k = useStore.getState().kpis!;
    expect(k.values.sun[1]).toBeCloseTo(0.4); // mean column
    expect(k.values.ice[1]).toBeCloseTo(1 - d_km / 20, 5);
    useStore.getState().resetKpiSettings();
  });
});

describe('performance', () => {
  it('rescoring 14,444 cells takes well under the 100 ms budget', () => {
    const n = 14_444;
    const mk = (f: (i: number) => number) => Array.from({length: n}, (_, i) => f(i));
    const lat = mk((i) => -90 + (i % 1000) / 100);
    const cells = makeCells(lat, {
      sun_best_pct: mk((i) => (i * 7) % 100),
      earth_best_pct: mk((i) => (i * 13) % 100),
      safe_frac: mk((i) => ((i * 3) % 100) / 100),
      svf: mk((i) => ((i * 11) % 100) / 100),
      ice_index: mk((i) => (i % 211 === 0 ? 0.5 : 0)),
      slope_p95_deg: mk((i) => i % 30),
    });
    cells.lon = mk((i) => (i % 360) - 180);
    const t0 = performance.now();
    const kpis = computeKpis(cells);
    const kpiMs = performance.now() - t0;
    const score = new Float32Array(n);
    const excluded = new Uint8Array(n);
    const f = defaultFilters();
    f.slope_p95_deg.enabled = true;
    let worst = 0;
    for (let r = 0; r < 20; r++) {
      const t = performance.now();
      scoreInto(kpis, W(r, 20 - r, 5, 1, 3), score);
      filtersInto(cells, f, excluded);
      worst = Math.max(worst, performance.now() - t);
    }
    console.log(`computeKpis ${kpiMs.toFixed(0)} ms, worst rescore ${worst.toFixed(2)} ms`);
    expect(worst).toBeLessThan(100);
    expect(kpiMs).toBeLessThan(1000);
    const t1 = performance.now();
    computeKpis(cells, {...DEFAULT_KPI_SETTINGS, iceIndexMin: 0.3});
    console.log(`computeKpis with a changed reference value ${(performance.now() - t1).toFixed(0)} ms`);
  });
});
