import {readFileSync} from 'node:fs';
import {cellToLatLng, latLngToCell} from 'h3-js';
import {describe, expect, it} from 'vitest';
import {cellPolygon_m, projectStereo_m, R_MOON_M, surfaceDistance_m, unprojectStereo_deg} from './projection';

// r at 80 deg S by hand: 2 * 1,737,400 * tan(5 deg) = 3,474,800 * 0.0874886635 = 304,005.6 m
const R80_M = 304_005.6;

describe('south polar stereographic projection', () => {
  it('matches hand values: lon 0 up, 90E right, 180 down, 90W left', () => {
    const [x0, y0] = projectStereo_m(-90, 123);
    expect(x0).toBeCloseTo(0, 6);
    expect(y0).toBeCloseTo(0, 6);
    const cases: [number, number, number][] = [
      [0, 0, R80_M],
      [90, R80_M, 0],
      [180, 0, -R80_M],
      [-90, -R80_M, 0],
    ];
    for (const [lon, x, y] of cases) {
      const [px, py] = projectStereo_m(-80, lon);
      expect(px).toBeCloseTo(x, 0);
      expect(py).toBeCloseTo(y, 0);
    }
  });

  it('round-trips, including lon +-180 and next to the pole', () => {
    const points: [number, number][] = [
      [-80, 0],
      [-85.5, 37.25],
      [-80.3, 90],
      [-88, -90],
      [-82, 179.999],
      [-82, -179.999],
      [-89.9999, 129.6],
      [-89.999999, -45],
      [-60, 12],
    ];
    for (const [lat, lon] of points) {
      const [lat2, lon2] = unprojectStereo_deg(...projectStereo_m(lat, lon));
      expect(lat2).toBeCloseTo(lat, 9);
      expect(lon2).toBeCloseTo(lon, 6);
    }
    // both spellings of the antimeridian come back as +180, the (-180, 180] convention
    expect(unprojectStereo_deg(...projectStereo_m(-85, 180))[1]).toBeCloseTo(180, 9);
    expect(unprojectStereo_deg(...projectStereo_m(-85, -180))[1]).toBeCloseTo(180, 9);
    expect(unprojectStereo_deg(0, 0)).toEqual([-90, 0]);
  });

  it('inverse round-trips from metres', () => {
    const points: [number, number][] = [
      [1, -1],
      [-250_000, 120_000],
      [0, -304_000],
      [-1e-3, -5],
    ];
    for (const [x, y] of points) {
      const [x2, y2] = projectStereo_m(...unprojectStereo_deg(x, y));
      expect(x2).toBeCloseTo(x, 6);
      expect(y2).toBeCloseTo(y, 6);
    }
  });
});

describe('lunar great-circle distance', () => {
  it('matches hand values on R = 1,737,400 m', () => {
    // 10 deg of arc: R * pi / 18 = 303,233.5 m
    expect(surfaceDistance_m(-90, 0, -80, 77)).toBeCloseTo(303_233.5, 0);
    // across the pole: (-85, 0) to (-85, 180) is also 10 deg of arc
    expect(surfaceDistance_m(-85, 0, -85, 180)).toBeCloseTo(303_233.5, 0);
    // a quarter of the circumference: R * pi / 2 = 2,729,101.5 m
    expect(surfaceDistance_m(0, 0, 0, 90)).toBeCloseTo(2_729_101.5, 0);
    expect(surfaceDistance_m(-83, 12, -83, 12)).toBe(0);
    expect(R_MOON_M).toBe(1_737_400);
  });
});

describe('cell polygons', () => {
  const {h3} = JSON.parse(
    readFileSync(new URL('../../public/data/fixture/cells_cap_r5.json', import.meta.url), 'utf8'),
  ) as {h3: string[]};

  it('projects every fixture cell; 89 of them have 7 or 8 vertices (V2-B)', () => {
    const sizes = h3.map((id) => cellPolygon_m(id).length / 2);
    expect(sizes).toHaveLength(14444);
    expect(new Set(sizes)).toEqual(new Set([6, 7, 8]));
    expect(sizes.filter((n) => n !== 6)).toHaveLength(89);
  });

  it('the pole cell surrounds the origin, with vertices a few km away', () => {
    const id = latLngToCell(-90, 0, 5);
    const poly = cellPolygon_m(id);
    const xs = poly.filter((_, i) => i % 2 === 0);
    const ys = poly.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    // lunar res-5 edge is about 2.5 km (Earth 9.2 km x 0.2727)
    const [cx, cy] = projectStereo_m(...cellToLatLng(id));
    for (let i = 0; i < xs.length; i++) {
      const d = Math.hypot(xs[i] - cx, ys[i] - cy);
      expect(d).toBeGreaterThan(2000);
      expect(d).toBeLessThan(3500);
    }
  });
});
