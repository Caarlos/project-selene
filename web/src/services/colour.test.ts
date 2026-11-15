import {describe, expect, it} from 'vitest';
import {CELL_ALPHA, EXCLUDED_RGBA, NULL_RGBA, writeCellColour} from './colour';
import {normaliseInto} from './store';

const rgba = (score: number, excluded = 0) => writeCellColour([0, 0, 0, 0], score, excluded);
// Rec. 709 luma: a perceptually ordered ramp gets steadily lighter
const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('colour ramp', () => {
  it('runs from viridis purple to yellow, semi-transparent', () => {
    expect(rgba(0)).toEqual([0x44, 0x01, 0x54, CELL_ALPHA]);
    expect(rgba(1)).toEqual([0xfd, 0xe7, 0x25, CELL_ALPHA]);
    expect(CELL_ALPHA).toBeLessThan(255);
  });
  it('gets lighter from low to high', () => {
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const l = luma(rgba(i / 100));
      expect(l).toBeGreaterThan(last);
      last = l;
    }
  });
  it('clamps out-of-range scores', () => {
    expect(rgba(-3)).toEqual(rgba(0));
    expect(rgba(7)).toEqual(rgba(1));
  });
  it('draws null neutral and excluded grey, excluded winning', () => {
    expect(rgba(NaN)).toEqual(NULL_RGBA);
    expect(rgba(0.5, 1)).toEqual(EXCLUDED_RGBA);
    expect(rgba(NaN, 1)).toEqual(EXCLUDED_RGBA);
    expect(EXCLUDED_RGBA[0]).toBe(EXCLUDED_RGBA[1]);
    expect(EXCLUDED_RGBA[1]).toBe(EXCLUDED_RGBA[2]);
  });
  it('writes into the target it is given', () => {
    const target = new Uint8ClampedArray(4);
    expect(writeCellColour(target, 1, 0)).toBe(target);
    expect([...target]).toEqual([0xfd, 0xe7, 0x25, CELL_ALPHA]);
  });
});

describe('normaliseInto', () => {
  it('normalises to min-max over non-null values, NaN for null', () => {
    const out = new Float32Array(4);
    expect(normaliseInto([10, null, 20, 15], out)).toEqual({min: 10, max: 20});
    expect([...out]).toEqual([0, NaN, 1, 0.5]);
  });
  it('handles constant and all-null columns', () => {
    const out = new Float32Array(2);
    expect(normaliseInto([7, 7], out)).toEqual({min: 7, max: 7});
    expect([...out]).toEqual([0.5, 0.5]);
    expect(normaliseInto([null, null], out)).toBeNull();
    expect([...out]).toEqual([NaN, NaN]);
  });
});
