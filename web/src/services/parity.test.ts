// Parity with the Python pipeline (PLAN.md section 11): tests/vectors/ephem_geometry.json against the real ephemeris.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {earthAzEl, rangeMetrics, sunAzEl} from './ephemeris';

const root = new URL('../../../', import.meta.url);
const vec = JSON.parse(readFileSync(new URL('tests/vectors/ephem_geometry.json', root), 'utf8'));
const buf = readFileSync(new URL('web/public/data/ephemeris_2026_2036.bin', root));
const table = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const STEP_S: number = vec.ephemeris.step_s;

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('parity with tests/vectors/ephem_geometry.json', () => {
  it('table matches the vector file header', () => {
    expect(table.length).toBe(vec.ephemeris.n * 5);
  });

  (vec.geometry_cases as Record<string, number>[]).forEach((c, i) => it(`geometry case ${i}`, () => {
    const o = c.time_index * 5;
    const out = new Float64Array(2);
    sunAzEl(c.lat_deg, c.lon_deg, table[o], table[o + 1], out);
    expect(Math.abs(out[1] - c.sun_el_deg)).toBeLessThan(0.01);
    if (Math.abs(c.sun_el_deg) < 89.99) expect(angDiff(out[0], c.sun_az_deg)).toBeLessThan(0.01);
    earthAzEl(c.lat_deg, c.lon_deg, c.height_m, table[o + 2], table[o + 3], table[o + 4], out);
    expect(Math.abs(out[1] - c.earth_el_deg)).toBeLessThan(0.01);
    if (Math.abs(c.earth_el_deg) < 89.99) expect(angDiff(out[0], c.earth_az_deg)).toBeLessThan(0.01);
  }));

  (vec.metrics_cases as (Record<string, number> & {horizon_deg: number[]})[]).forEach((k, i) => it(`metrics case ${i}`, () => {
    const h = Float64Array.from(k.horizon_deg); // exact: Int16 centi-degrees add up to 0.3 pp (see next test)
    const w = vec.metrics_window;
    const out = new Float64Array(4);
    rangeMetrics(k.lat_deg, k.lon_deg, k.height_m, h, table, w.first_time_index, w.first_time_index + w.n_steps, STEP_S, out, 1);
    expect(Math.abs(out[0] - k.sun_pct)).toBeLessThan(0.1);
    expect(Math.abs(out[1] - k.dark_max_h)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[2] - k.earth_pct)).toBeLessThan(0.1);
    expect(Math.abs(out[3] - k.earth_outage_max_h)).toBeLessThanOrEqual(1);
  }));

  it('Int16 centi-degree horizons stay within 0.3 pp (the Sun grazes a -0.087 deg horizon in case 0)', () => {
    const k = vec.metrics_cases[0];
    const w = vec.metrics_window;
    const out = new Float64Array(4);
    rangeMetrics(k.lat_deg, k.lon_deg, k.height_m, Int16Array.from(k.horizon_deg, (d: number) => Math.round(d * 100)), table, w.first_time_index, w.first_time_index + w.n_steps, STEP_S, out);
    expect(Math.abs(out[0] - k.sun_pct)).toBeLessThan(0.3);
  });
});
