import {describe, expect, it} from 'vitest';
import {
  addDays,
  emptyRangeValues,
  lunarMonthEnd,
  mergeChunk,
  monthRange,
  splitCells,
  validateRange,
  workerCount,
} from './rangeProtocol';

const T0 = '2026-01-01T00:00:00Z';
const N = 87648; // 2026-01-01 .. 2035-12-31 hourly

describe('validateRange', () => {
  it('maps whole days to table rows, end day included', () => {
    expect(validateRange(T0, 3600, N, '2026-01-01', '2026-01-01')).toEqual({ok: true, startIndex: 0, endIndex: 24});
    expect(validateRange(T0, 3600, N, '2027-02-01', '2027-02-28')).toEqual({ok: true, startIndex: 9504, endIndex: 9504 + 672});
  });
  it('accepts exactly 366 days and rejects 367', () => {
    expect(validateRange(T0, 3600, N, '2028-01-01', '2028-12-31').ok).toBe(true); // 366 days (leap)
    expect(validateRange(T0, 3600, N, '2027-01-01', '2028-01-02').ok).toBe(false);
  });
  it('rejects reversed, malformed and out-of-table dates', () => {
    expect(validateRange(T0, 3600, N, '2027-03-01', '2027-02-01').ok).toBe(false);
    expect(validateRange(T0, 3600, N, '2027-3-1', '2027-03-02').ok).toBe(false);
    expect(validateRange(T0, 3600, N, '2025-12-31', '2026-01-05').ok).toBe(false);
    expect(validateRange(T0, 3600, N, '2035-12-31', '2036-01-01').ok).toBe(false);
    expect(validateRange(T0, 3600, N, '2027-02-30', '2027-03-02').ok).toBe(false);
  });
  it('allows the last day of the table', () => {
    expect(validateRange(T0, 3600, N, '2035-12-31', '2035-12-31')).toMatchObject({ok: true, endIndex: N});
  });
});

describe('dates', () => {
  it('addDays, monthRange, lunarMonthEnd', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(monthRange(2027, 2)).toEqual({start: '2027-02-01', end: '2027-02-28'});
    expect(monthRange(2028, 12)).toEqual({start: '2028-12-01', end: '2028-12-31'});
    expect(lunarMonthEnd('2027-01-01')).toBe('2027-01-30');
  });
});

describe('workers and chunks', () => {
  it('workerCount is clamped to 1..4', () => {
    expect([undefined, 0, 1, 2, 8, 64, NaN].map(workerCount)).toEqual([1, 1, 1, 2, 4, 4, 1]);
  });
  it('splitCells covers every cell once, in order, with near-equal blocks', () => {
    for (const [n, k] of [[3000, 4], [14444, 3], [5, 4], [2, 4], [1, 1], [0, 3]]) {
      const blocks = splitCells(n, k);
      let next = 0;
      for (const b of blocks) {
        expect(b.from).toBe(next);
        expect(b.to).toBeGreaterThan(b.from);
        next = b.to;
      }
      expect(next).toBe(n);
      expect(blocks.length).toBeLessThanOrEqual(k);
      if (blocks.length > 1) {
        const sizes = blocks.map((b) => b.to - b.from);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('mergeChunk de-interleaves a block into the columns and leaves other cells NaN', () => {
    const v = emptyRangeValues(5);
    mergeChunk(v, 2, Float64Array.of(1, 2, 3, 4, 5, 6, 7, 8));
    expect(Array.from(v.sun_best_pct)).toEqual([NaN, NaN, 1, 5, NaN]);
    expect(Array.from(v.dark_max_h_best)).toEqual([NaN, NaN, 2, 6, NaN]);
    expect(Array.from(v.earth_best_pct)).toEqual([NaN, NaN, 3, 7, NaN]);
    expect(Array.from(v.earth_outage_max_h_best)).toEqual([NaN, NaN, 4, 8, NaN]);
  });
});
