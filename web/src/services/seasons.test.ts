import {describe, expect, it} from 'vitest';
import {extremeMonths, monthMeanSubSolarLat_deg} from './seasons';

describe('polar seasons', () => {
  // daily rows over 2027: sub-solar latitude 1.5 cos(2 pi (day - 120) / 365): +1.5 on 1 May, -1.5 near 30 Oct
  const step_s = 86_400;
  const t0 = Date.UTC(2027, 0, 1);
  const n = 365;
  const table = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) table[i * 5 + 1] = 1.5 * Math.cos((2 * Math.PI * (i - 120)) / 365);

  it('month means follow the table', () => {
    const m = monthMeanSubSolarLat_deg(table, t0, step_s, n, 2027);
    expect(m).toHaveLength(12);
    expect(m[3]).toBeGreaterThan(1.2); // April
    expect(m[9]).toBeLessThan(-1.2); // October
    expect(monthMeanSubSolarLat_deg(table, t0, step_s, n, 2030).every(Number.isNaN)).toBe(true);
  });

  it('negative latitude is summer, positive is winter', () => {
    const e = extremeMonths(monthMeanSubSolarLat_deg(table, t0, step_s, n, 2027))!;
    expect(e.winter).toBe(5);
    expect(e.summer).toBe(10);
    expect(extremeMonths([NaN, NaN])).toBeNull();
  });
});
