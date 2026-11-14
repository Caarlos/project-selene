import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {parseCells, parseManifest} from './types';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../public/data/fixture/${name}`, import.meta.url), 'utf8'));

describe('data contract guards', () => {
  it('accepts the committed fixture manifest', () => {
    const m = parseManifest(fixture('manifest.json'));
    expect(m.scenario_id).toBe('fixture');
    expect(m.synthetic).toBe(true);
    expect(m.grids[0]).toMatchObject({id: 'cap_r5', res: 5, n_cells: 14444});
  });

  it('rejects a wrong schema_version with a clear message', () => {
    const doc = {...(fixture('manifest.json') as object), schema_version: 2};
    expect(() => parseManifest(doc)).toThrow(/Unsupported data schema_version 2: this app reads version 1/);
    expect(() => parseManifest({})).toThrow(/schema_version undefined/);
  });

  it('names the invalid fields', () => {
    const doc = {...(fixture('manifest.json') as object), synthetic: 'no', grids: [{id: 'cap_r5'}]};
    expect(() => parseManifest(doc)).toThrow(/synthetic, grids\[0\]/);
  });

  it('accepts the committed fixture cells and rejects a length mismatch', () => {
    const doc = fixture('cells_cap_r5.json');
    const cells = parseCells(doc, 14444);
    expect(cells.h3).toHaveLength(14444);
    expect(Math.max(...cells.lat)).toBeLessThanOrEqual(-80);
    expect(() => parseCells(doc, 14443)).toThrow(/not of length 14443: h3, lat/);
  });
});
