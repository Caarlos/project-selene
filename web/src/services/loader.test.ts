import {readFileSync} from 'node:fs';
import {getResolution} from 'h3-js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {assertCellSet, decodeEphemeris, decodeHorizons, loadHorizons, loadPatch, loadScenario, parseIndex, pickScenario} from './loader';
import {parseManifest, type Cells} from './types';

const DATA_URL = 'http://test.invalid/app/data/';
const file = (path: string) => readFileSync(new URL(`../../public/data/${path}`, import.meta.url));
const json = (path: string): unknown => JSON.parse(file(path).toString('utf8'));
const arrayBuffer = (path: string): ArrayBuffer => new Uint8Array(file(path)).buffer;
const manifest = () => parseManifest(json('fixture/manifest.json'));

/** fetch() served from web/public/data, with optional replaced documents. */
function stubFetch(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (!url.startsWith(DATA_URL)) return new Response(null, {status: 404});
    const path = url.slice(DATA_URL.length);
    if (path in overrides) return new Response(JSON.stringify(overrides[path]));
    try {
      return new Response(new Uint8Array(file(path)));
    } catch {
      return new Response(null, {status: 404});
    }
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('scenario index', () => {
  it('takes the first scenario by default and the named one on request', () => {
    const index = parseIndex([
      {id: 'a', manifest: 'a/manifest.json'},
      {id: 'b', manifest: 'b/manifest.json'},
    ]);
    expect(pickScenario(index, null).id).toBe('a');
    expect(pickScenario(index, 'b').manifest).toBe('b/manifest.json');
    expect(() => pickScenario(index, 'zzz')).toThrow(/Unknown scenario "zzz". Available: a, b/);
  });
  it('rejects an empty or malformed index', () => {
    expect(() => parseIndex([])).toThrow(/lists no scenario/);
    expect(() => parseIndex([{id: 'a'}])).toThrow(/lists no scenario/);
    expect(() => parseIndex({})).toThrow(/lists no scenario/);
  });
});

describe('loadScenario', () => {
  it('loads the fixture: cells, projected polygons, resolved URLs, lazy horizons', async () => {
    stubFetch();
    const s = await loadScenario(DATA_URL, 'fixture');
    expect(s.manifest.scenario_id).toBe('fixture');
    expect(s.cells.h3).toHaveLength(14444);
    expect(s.polygons_m).toHaveLength(s.grid.n_cells);
    expect(s.hillshadeUrl).toBe(`${DATA_URL}fixture/hillshade.webp`);
    const horizons = await loadHorizons(s);
    expect(horizons.n_rows).toBe(3000);
    expect(loadHorizons(s)).toBe(loadHorizons(s)); // one download
  });

  it('rejects a wrong schema_version with a clear message', async () => {
    stubFetch({'fixture/manifest.json': {...(json('fixture/manifest.json') as object), schema_version: 2}});
    await expect(loadScenario(DATA_URL, 'fixture')).rejects.toThrow(
      /Unsupported data schema_version 2: this app reads version 1/,
    );
  });

  it('rejects a cell count that differs from the manifest', async () => {
    const m = json('fixture/manifest.json') as {grids: {n_cells: number}[]};
    m.grids[0].n_cells = 14445;
    stubFetch({'fixture/manifest.json': m});
    await expect(loadScenario(DATA_URL, 'fixture')).rejects.toThrow(/not of length 14445/);
  });

  it('reports a missing file and an unknown scenario', async () => {
    stubFetch({'index.json': [{id: 'gone', manifest: 'gone/manifest.json'}]});
    await expect(loadScenario(DATA_URL, null)).rejects.toThrow(/gone\/manifest.json: HTTP 404/);
    await expect(loadScenario(DATA_URL, 'other')).rejects.toThrow(/Unknown scenario "other"/);
  });
});

describe('cell set', () => {
  const grid = {id: 'g', res: 5, n_cells: 2, cells: '', horizons: ''};
  const cells = (h3: string[]) => ({h3}) as Cells;
  it('accepts distinct cells of the grid resolution', () => {
    expect(() => assertCellSet(cells(['85f29383fffffff', '85f2938ffffffff']), grid)).not.toThrow();
  });
  it('rejects a wrong count, duplicates, and non-cells', () => {
    expect(() => assertCellSet(cells(['85f29383fffffff']), grid)).toThrow(/1 cells, manifest says 2/);
    expect(() => assertCellSet(cells(['85f29383fffffff', '85f29383fffffff']), grid)).toThrow(/duplicate/);
    expect(() => assertCellSet(cells(['85f29383fffffff', 'nope']), grid)).toThrow(
      /"nope" is not an H3 cell of resolution 5/,
    );
  });
});

describe('horizons', () => {
  const grid = manifest().grids[0];
  it('decodes Int16 little-endian centi-degrees', () => {
    const buf = new ArrayBuffer(2 * 360 * 2);
    const view = new DataView(buf);
    view.setInt16(0, -9, true); // row 0, azimuth 0: -0.09 deg
    view.setInt16(2 * (360 + 359), 1234, true); // row 1, azimuth 359: 12.34 deg
    const h = decodeHorizons(buf, {...grid, n_cells: 2, horizons_n_cells: undefined});
    expect(h.n_rows).toBe(2);
    expect(h.row_cdeg(0)).toHaveLength(360);
    expect(h.row_cdeg(0)![0]).toBe(-9);
    expect(h.row_cdeg(1)![359]).toBe(1234);
    expect(h.row_cdeg(2)).toBeNull();
    expect(h.row_cdeg(-1)).toBeNull();
  });
  it('reads the fixture and returns null beyond horizons_n_cells', () => {
    const h = decodeHorizons(arrayBuffer('fixture/horizons_cap_r5.bin'), grid);
    expect(h.n_rows).toBe(3000);
    expect(h.row_cdeg(2999)).toBeInstanceOf(Int16Array);
    expect(h.row_cdeg(3000)).toBeNull();
    expect(h.row_cdeg(14443)).toBeNull();
  });
  it('rejects a short file', () => {
    const full = arrayBuffer('fixture/horizons_cap_r5.bin');
    expect(() => decodeHorizons(full.slice(0, 2_159_000), grid)).toThrow(
      /horizons_cap_r5.bin: 2159000 bytes, expected 2160000/,
    );
    // a real scenario (no horizons_n_cells) must hold every cell
    expect(() => decodeHorizons(full, {...grid, horizons_n_cells: undefined})).toThrow(/expected 10399680/);
  });
});

describe('ephemeris', () => {
  it('decodes Float32 little-endian, n x 5', () => {
    const buf = new ArrayBuffer(2 * 5 * 4);
    new DataView(buf).setFloat32(4 * 9, 384400, true); // row 1, Earth-Moon distance
    const e = decodeEphemeris(buf, {file: 'e.bin', t0: '2026-01-01T00:00:00Z', step_s: 3600, n: 2});
    expect(e.table).toHaveLength(10);
    expect(e.table[9]).toBe(384400);
    expect(e).toMatchObject({t0: '2026-01-01T00:00:00Z', step_s: 3600, n: 2});
  });
  it('reads the fixture and rejects a size mismatch', () => {
    const eph = manifest().ephemeris;
    expect(decodeEphemeris(arrayBuffer(`fixture/${eph.file}`), eph).table).toHaveLength(8760 * 5);
    expect(() => decodeEphemeris(new ArrayBuffer(20), eph)).toThrow(/20 bytes, expected 175200/);
  });
});

describe('detail patch of the real scenario', () => {
  it('rejects a patch whose cells do not match the manifest', async () => {
    const real = json('south-pole-2027/cells_shackleton_ridge.json') as {h3: string[]};
    stubFetch({'south-pole-2027/cells_shackleton_ridge.json': {...real, h3: real.h3.slice(1)}});
    const s = await loadScenario(DATA_URL, 'south-pole-2027');
    await expect(loadPatch(s, 'shackleton_ridge')).rejects.toThrow(/column\(s\) missing or not of length/);
  });

  it('is not downloaded with the scenario, then loads lazily, validated, as rows after the overview', async () => {
    const requested: string[] = [];
    stubFetch();
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string) => (requested.push(url), inner(url)));
    const s = await loadScenario(DATA_URL, 'south-pole-2027');
    expect(s.patches.map((g) => g.id)).toEqual(['shackleton_ridge']);
    expect(requested.some((u) => u.includes('shackleton'))).toBe(false);
    const p = await loadPatch(s, 'shackleton_ridge');
    const n0 = s.grid.n_cells;
    const patch = p.grids[1];
    expect(p.cells.h3).toHaveLength(n0 + patch.grid.n_cells);
    expect(p.polygons_m).toHaveLength(p.cells.h3.length);
    expect(p.cells.h3[n0 - 1]).toBe(s.cells.h3[n0 - 1]); // overview rows keep their index
    expect(getResolution(p.cells.h3[n0])).toBe(7);
    expect(patch.rowStart).toBe(n0);
    // overview cells whose centre is in the 50 km square: about 2500 km2 / 20 km2
    expect(patch.covered.length).toBeGreaterThan(80);
    expect(patch.covered.length).toBeLessThan(160);
    expect(patch.covered.every((i) => i < n0)).toBe(true);
    expect(await loadPatch(p, 'shackleton_ridge')).toBe(p); // loading twice adds nothing
    const h = await loadHorizons(p);
    expect(h.n_rows).toBe(p.cells.h3.length);
    expect(h.row_cdeg(n0 + 5)).toHaveLength(360);
    expect(h.row_cdeg(0)).toHaveLength(360);
    await expect(loadPatch(s, 'nope')).rejects.toThrow(/Unknown detail patch/);
  });
});
