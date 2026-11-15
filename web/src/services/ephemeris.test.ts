import {describe, expect, it} from 'vitest';
import {
  bodyTrack,
  clipRange,
  DARK_MAX_H,
  earthAzEl,
  EARTH_OUTAGE_MAX_H,
  EARTH_PCT,
  horizonAt,
  litFraction,
  rangeMetrics,
  SUN_PCT,
  sunAzEl,
} from './ephemeris';

const out = new Float64Array(4);
const flat = new Int16Array(360);

describe('sunAzEl', () => {
  it('at the pole on a smooth sphere the elevation is minus the sub-solar latitude', () => {
    for (const lat of [-1.5, 0, 0.7, 1.54]) {
      sunAzEl(-90, 0, 123, lat, out);
      expect(out[1]).toBeCloseTo(-lat, 2);
    }
  });
  it('sees the Sun overhead at the sub-solar point', () => {
    sunAzEl(0, 40, 40, 0, out);
    expect(out[1]).toBeCloseTo(90, 6);
  });
  it('azimuth is clockwise from north: Sun due east of an equatorial point gives 90, due west 270', () => {
    sunAzEl(0, 0, 90, 0, out);
    expect(out[0]).toBeCloseTo(90, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    sunAzEl(0, 0, -90, 0, out);
    expect(out[0]).toBeCloseTo(270, 6);
    sunAzEl(0, 0, 0, 45, out);
    expect(out[0]).toBeCloseTo(0, 6);
  });
});

describe('earthAzEl', () => {
  it('shows parallax: 90 deg from the sub-Earth point Earth sits at -0.26 deg, not 0', () => {
    earthAzEl(0, 0, 0, 90, 0, 384_400, out);
    expect(out[1]).toBeCloseTo(-0.259, 2);
    expect(out[0]).toBeCloseTo(90, 6);
  });
  it('is at the zenith at the sub-Earth point, and a higher point sees it lower', () => {
    earthAzEl(10, 20, 0, 20, 10, 384_400, out);
    expect(out[1]).toBeCloseTo(90, 6);
    earthAzEl(0, 0, 100_000, 90, 0, 384_400, out);
    expect(out[1]).toBeLessThan(-0.259 - 0.01);
  });
});

describe('horizonAt', () => {
  it('interpolates linearly and wraps 359 -> 0', () => {
    const h = new Int16Array(360);
    h[359] = 200;
    h[0] = 400;
    h[10] = 100;
    h[11] = 300;
    expect(horizonAt(h, 359)).toBeCloseTo(2, 9);
    expect(horizonAt(h, 359.5)).toBeCloseTo(3, 9);
    expect(horizonAt(h, 0)).toBeCloseTo(4, 9);
    expect(horizonAt(h, -0.5)).toBeCloseTo(3, 9);
    expect(horizonAt(h, 360)).toBeCloseTo(4, 9);
    expect(horizonAt(h, 10.25)).toBeCloseTo(1.5, 9);
  });
});

describe('litFraction', () => {
  it('is 0, 0.5, 1 at the disc edges and centre', () => {
    expect(litFraction(-0.266 + 2, 2)).toBeCloseTo(0, 12);
    expect(litFraction(2, 2)).toBeCloseTo(0.5, 12);
    expect(litFraction(2.266, 2)).toBeCloseTo(1, 12);
    expect(litFraction(-30, 2)).toBe(0);
    expect(litFraction(30, 2)).toBe(1);
  });
});

/** Pole point (lat -90): Sun elevation = -sub-solar lat; Earth elevation +-90 by the sign of the sub-Earth lat. */
function table(rows: [number, number][]): Float32Array {
  const t = new Float32Array(rows.length * 5);
  rows.forEach(([sunLat, earthLat], i) => t.set([0, sunLat, 0, earthLat, 384_400], i * 5));
  return t;
}

describe('rangeMetrics', () => {
  const run = (rows: [number, number][], a = 0, b = rows.length) => {
    rangeMetrics(-90, 0, 0, flat, table(rows), a, b, 3600, out);
    return Array.from(out);
  };
  it('counts dark runs, including runs touching either end', () => {
    // sun lat -1 = lit (el +1), +1 = dark; Earth lat 0 at the pole is on the horizon plane (el -0.26 => not visible)
    expect(run([[1, 0], [1, 0], [-1, 0], [-1, 0], [1, 0]])).toEqual([40, 2, 0, 5]);
    expect(run([[-1, 0], [1, 0], [1, 0], [1, 0], [-1, 0], [1, 0], [1, 0]])[DARK_MAX_H]).toBe(3);
    expect(run([[-1, 0], [1, 0], [-1, 0], [1, 0], [1, 0], [1, 0]])[DARK_MAX_H]).toBe(3);
    expect(run([[-1, 0], [-1, 0]])[SUN_PCT]).toBe(100);
  });
  it('earth visibility and longest outage', () => {
    // Earth lat -90 => zenith (visible); +90 => nadir (not visible)
    const r = run([[0, -90], [0, 90], [0, 90], [0, -90], [0, 90]]);
    expect(r[EARTH_PCT]).toBeCloseTo(40, 9);
    expect(r[EARTH_OUTAGE_MAX_H]).toBe(2);
  });
  it('honours the range and the step length', () => {
    rangeMetrics(-90, 0, 0, flat, table([[1, 90], [1, 90], [-1, -90]]), 0, 2, 1800, out);
    expect(out[DARK_MAX_H]).toBe(1);
    expect(out[EARTH_OUTAGE_MAX_H]).toBe(1);
    run([[0, 0]], 1, 1);
    expect(out[SUN_PCT]).toBeNaN();
  });
  it('uses the horizon: a 5 deg horizon darkens a Sun at 3 deg', () => {
    const h = new Int16Array(360).fill(500);
    rangeMetrics(-90, 0, 0, h, table([[-3, 0]]), 0, 1, 3600, out);
    expect(out[SUN_PCT]).toBe(0);
  });
});

describe('ranges and tracks', () => {
  it('clips a requested range to the table', () => {
    expect(clipRange('2027-01-01T00:00:00Z', 3600, 8760, '2026-12-01T00:00:00Z', '2028-06-01T00:00:00Z')).toEqual({
      startIndex: 0,
      endIndex: 8760,
    });
    expect(clipRange('2027-01-01T00:00:00Z', 3600, 8760, '2027-01-02T00:00:00Z', '2027-01-03T00:00:00Z')).toEqual({
      startIndex: 24,
      endIndex: 48,
    });
  });
  it('down-samples a track and keeps row indices', () => {
    const t = bodyTrack('sun', -90, 0, 0, table([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]), 0, 5, 2);
    expect(t.length).toBe(9);
    expect(Array.from(t.filter((_, i) => i % 3 === 2))).toEqual([0, 2, 4]);
    expect(t[1]).toBeCloseTo(-1, 4);
  });
});
