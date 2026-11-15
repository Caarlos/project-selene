import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {rangeMetrics} from './ephemeris';
import {cellMetrics, precomputeRange} from './rangeKernel';

const buf = readFileSync(new URL('../../public/data/ephemeris_2026_2036.bin', import.meta.url));
const table = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// deterministic LCG so a failure is reproducible
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

function randomHorizon(): Int16Array {
  const h = new Int16Array(360);
  const base = Math.round((rnd() * 4 - 1) * 100);
  const amp = Math.round(rnd() * 600);
  const k = 1 + Math.floor(rnd() * 5);
  for (let a = 0; a < 360; a++) h[a] = base + Math.round(amp * Math.sin((k * a * Math.PI) / 180) * rnd());
  return h;
}

describe('rangeKernel', () => {
  it('matches rangeMetrics within 1e-6 on random cells and ranges', () => {
    const a = new Float64Array(4);
    const b = new Float64Array(4);
    for (let t = 0; t < 40; t++) {
      const start = Math.floor(rnd() * 80000);
      const end = start + 24 + Math.floor(rnd() * 8784);
      const lat = -90 + rnd() * 20; // includes the pole region
      const lon = -180 + rnd() * 360;
      const height = -3000 + rnd() * 6000;
      const hor = randomHorizon();
      rangeMetrics(lat, lon, height, hor, table, start, end, 3600, a);
      cellMetrics(lat, lon, height, hor, precomputeRange(table, start, end, 3600), b);
      for (let i = 0; i < 4; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-6);
    }
  });

  it('handles the pole exactly and an empty range', () => {
    const a = new Float64Array(4);
    const b = new Float64Array(4);
    const hor = new Int16Array(360).fill(-9);
    rangeMetrics(-90, 0, 0, hor, table, 9504, 10176, 3600, a);
    cellMetrics(-90, 0, 0, hor, precomputeRange(table, 9504, 10176, 3600), b);
    for (let i = 0; i < 4; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-6);
    cellMetrics(-90, 0, 0, hor, precomputeRange(table, 5, 5, 3600), b);
    expect(Array.from(b).every(Number.isNaN)).toBe(true);
  });

  it('is much faster than rangeMetrics (timing, logged)', () => {
    const hor = randomHorizon();
    const out = new Float64Array(4);
    const N = 30;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) rangeMetrics(-85, i, 0, hor, table, 0, 8760, 3600, out);
    const old_ms = (performance.now() - t0) / N;
    const rv = precomputeRange(table, 0, 8760, 3600);
    const t1 = performance.now();
    for (let i = 0; i < N; i++) cellMetrics(-85, i, 0, hor, rv, out);
    const new_ms = (performance.now() - t1) / N;
    console.log(`per cell-year: rangeMetrics ${old_ms.toFixed(2)} ms, cellMetrics ${new_ms.toFixed(2)} ms`);
    expect(new_ms).toBeLessThan(old_ms);
  });
});
