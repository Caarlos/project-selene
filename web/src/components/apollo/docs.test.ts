import {describe, expect, it} from 'vitest';
import outreach from '../../../../docs/outreach_guide.md?raw';
import {docHref, extractHeadings, findHeadingId, parseDocHash, slug} from './headings';
import {parseModules} from './modules';

const SAMPLE = `# Title

## Part 4. Metric reference

### sun_best_pct
text

\`\`\`
### not_a_heading
\`\`\`

### \`kpi_sun\`
`;

describe('headings', () => {
  it('slugs keep metric ids intact', () => {
    expect(slug('sun_best_pct')).toBe('sun_best_pct');
    expect(slug('Part 4. Metric reference')).toBe('part-4-metric-reference');
  });
  it('extracts headings and skips fenced code', () => {
    expect(extractHeadings(SAMPLE).map((h) => h.id)).toEqual(['part-4-metric-reference', 'sun_best_pct', 'kpi_sun']);
  });
  it('finds a metric heading, null when missing', () => {
    expect(findHeadingId(SAMPLE, 'sun_best_pct')).toBe('sun_best_pct');
    expect(findHeadingId(SAMPLE, 'kpi_sun')).toBe('kpi_sun');
    expect(findHeadingId(SAMPLE, 'ice_index')).toBeNull();
    expect(findHeadingId(SAMPLE, 'not_a_heading')).toBeNull();
  });
  it('round-trips the link hash', () => {
    expect(parseDocHash(docHref('primer', 'sun_best_pct'))).toEqual({doc: 'primer', h: 'sun_best_pct'});
    expect(parseDocHash('#doc=nope')).toEqual({doc: 'primer', h: null});
  });
});

describe('module table', () => {
  const mods = parseModules(outreach);
  it('has the core and the eight modules', () => {
    expect(mods.map((m) => m.name)).toEqual(['SELENE', 'HYPERION', 'EOS', 'HESTIA', 'ARGUS', 'HERMES', 'ASTRAEA', 'ARTEMIS', 'APOLLO']);
  });
  it('fills every field', () => {
    for (const m of mods) {
      expect(m.backronym).not.toBe('');
      expect(m.role).not.toBe('');
      expect(m.myth).not.toBe('');
    }
    expect(mods[2].backronym).toBe('Ephemeris & Orbital Sunlight Simulator');
  });
});
