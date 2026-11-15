import {describe, expect, it} from 'vitest';
import {gridOfRow} from '../../services/detail';
import type {Scenario} from '../../services/loader';
import {projectStereo_m, unprojectStereo_deg} from '../../services/projection';
import {steepestSlopeAlong} from './baseToIce';
import {batteryEstimate} from './battery';
import {bestColumns, COMPARE_ROWS} from './comparator';

describe('batteryEstimate', () => {
  it('m = P t / (e DoD): 1 kW for 100 h at 200 Wh/kg and 0.8 is 100 kWh and 625 kg', () => {
    expect(batteryEstimate(1, 100, 200, 0.8)).toEqual({energy_kWh: 100, mass_kg: 625});
    const r = batteryEstimate(2.5, 12, 250, 0.5)!;
    expect(r.energy_kWh).toBe(30);
    expect(r.mass_kg).toBeCloseTo(240, 9);
  });
  it('returns null for unknown or unusable input', () => {
    expect(batteryEstimate(1, null, 200, 0.8)).toBeNull();
    expect(batteryEstimate(1, NaN, 200, 0.8)).toBeNull();
    expect(batteryEstimate(1, 10, 0, 0.8)).toBeNull();
    expect(batteryEstimate(1, 10, 200, 0)).toBeNull();
    expect(batteryEstimate(1, 10, 200, 1.5)).toBeNull();
    expect(batteryEstimate(-1, 10, 200, 0.8)).toBeNull();
  });
  it('zero darkness needs no battery', () => {
    expect(batteryEstimate(1, 0, 200, 0.8)).toEqual({energy_kWh: 0, mass_kg: 0});
  });
});

describe('steepestSlopeAlong', () => {
  // Cells are 10 km wide bands of projected x (row = floor(x / 10 km)); rows outside 0..3 are not in the scenario.
  const slopes = [3, 12, null, 7];
  const cellAt = (lat: number, lon: number) => {
    const row = Math.floor(projectStereo_m(lat, lon)[0] / 10_000);
    return row >= 0 && row <= 3 ? row : undefined;
  };
  const at = (x_m: number) => {
    const [lat_deg, lon_deg] = unprojectStereo_deg(x_m, 1);
    return {lat_deg, lon_deg};
  };
  it('picks the steepest cell crossed, skipping null slopes', () => {
    expect(steepestSlopeAlong(at(1000), at(39_000), cellAt, slopes)).toEqual({
      maxSlope_deg: 12,
      cellIndex: 1,
      cellsCrossed: 4,
    });
  });
  it('only sees the cells on the line and skips cells outside the scenario', () => {
    expect(steepestSlopeAlong(at(1000), at(9000), cellAt, slopes)).toEqual({maxSlope_deg: 3, cellIndex: 0, cellsCrossed: 1});
    expect(steepestSlopeAlong(at(21_000), at(29_000), cellAt, slopes)).toMatchObject({maxSlope_deg: null, cellIndex: null});
    expect(steepestSlopeAlong(at(31_000), at(60_000), cellAt, slopes)).toMatchObject({maxSlope_deg: 7, cellsCrossed: 1});
  });
  it('handles identical end points', () => {
    expect(steepestSlopeAlong(at(5000), at(5000), cellAt, slopes).maxSlope_deg).toBe(3);
  });
});

describe('bestColumns', () => {
  it('highlights the highest or lowest value by direction, ties included, nulls ignored', () => {
    expect(bestColumns([0.2, 0.9, null], 'higher')).toEqual([1]);
    expect(bestColumns([40, 12, 12], 'lower')).toEqual([1, 2]);
    expect(bestColumns([1, 2], null)).toEqual([]);
    expect(bestColumns([5, null], 'higher')).toEqual([]);
  });
  it('rows encode the right direction', () => {
    const dir = (id: string) => COMPARE_ROWS.find((r) => 'id' in r && r.id === id)?.better;
    expect(dir('sun_best_pct')).toBe('higher');
    expect(dir('dark_max_h_best')).toBe('lower');
    expect(dir('earth_outage_max_h_best')).toBe('lower');
    expect(dir('slope_p95_deg')).toBe('lower');
    expect(dir('safe_frac')).toBe('higher');
    expect(dir('elev_m')).toBeNull();
  });
});

describe('base-to-ice sampling resolution', () => {
  it('uses the resolution of the grid that holds the cell: res 5 for overview rows, res 7 for patch rows', () => {
    const grids = [
      {grid: {id: 'cap', res: 5}, rowStart: 0, covered: []},
      {grid: {id: 'p', res: 7}, rowStart: 10, covered: []},
    ];
    const scenario = {grids} as unknown as Scenario;
    expect([0, 9, 10, 25].map((r) => gridOfRow(scenario, r).grid.res)).toEqual([5, 5, 7, 7]);
  });
});
