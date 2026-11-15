import {describe, expect, it} from 'vitest';
import {binFractions, combinedPct, computeDsn, moonElevations, STATIONS, windows} from './dsn';

const T0 = Date.parse('2027-02-01T00:00:00Z');
const MONTH = 672; // 28 days hourly

describe('DSN Moon visibility', () => {
  it('each station sees the Moon 25-55% of a month; some station sees it > 90%', async () => {
    const r = (await computeDsn(T0, 3600, 0, MONTH))!;
    expect(r.n).toBe(MONTH);
    for (const p of r.stationPct) {
      expect(p).toBeGreaterThan(25);
      expect(p).toBeLessThan(55);
    }
    expect(r.anyPct).toBeGreaterThan(90);
    expect(r.windows).toHaveLength(3);
    // windows are consistent with the flags
    r.windows.forEach((w, s) => expect(w.reduce((c, [a, b]) => c + b - a, 0)).toBe(r.usable[s].reduce((c, v) => c + v, 0)));
  });

  it('Moon altitude has opposite signs at antipodal-ish stations (Madrid vs Canberra differ by ~153 deg of longitude)', () => {
    // Opposite sides of the Earth cannot both see the Moon above the horizon: sample a month and count.
    const madrid = moonElevations(STATIONS[0], T0, 3600, 0, new Float32Array(MONTH));
    const canberra = moonElevations(STATIONS[2], T0, 3600, 0, new Float32Array(MONTH));
    let bothUp = 0;
    let oppositeSigns = 0;
    for (let i = 0; i < MONTH; i++) {
      if (madrid[i] > 10 && canberra[i] > 10) bothUp++;
      if (madrid[i] * canberra[i] < 0) oppositeSigns++;
    }
    expect(oppositeSigns).toBeGreaterThan(100);
    expect(bothUp).toBeLessThan(MONTH * 0.1); // geometrically rare: only when the Moon is near the horizon of both
  });

  it('a Moon above the horizon at one point is below at its antipode (synthetic stations)', () => {
    const a = {name: 'a', lat_deg: 20, lon_deg: 30};
    const b = {name: 'b', lat_deg: -20, lon_deg: -150};
    const ea = moonElevations(a, T0, 3600, 0, new Float32Array(48));
    const eb = moonElevations(b, T0, 3600, 0, new Float32Array(48));
    for (let i = 0; i < 48; i++) {
      expect(ea[i] + eb[i]).toBeLessThan(2); // elevations from antipodal points sum to ~ -(parallax) < 2 deg
      if (ea[i] > 5) expect(eb[i]).toBeLessThan(0);
    }
  });

  it('windows, combinedPct and binFractions on hand-made series', () => {
    expect(windows(Uint8Array.of(0, 1, 1, 0, 1))).toEqual([[1, 3], [4, 5]]);
    expect(windows(Uint8Array.of(1, 1))).toEqual([[0, 2]]);
    expect(windows(new Uint8Array(0))).toEqual([]);
    expect(combinedPct(Uint8Array.of(1, 1, 0, 0), Uint8Array.of(1, 0, 1, 0))).toBe(25);
    expect(Array.from(binFractions(Uint8Array.of(1, 1, 0, 0, 1), 2))).toEqual([1, 0, 1]);
  });

  it('can be cancelled', async () => {
    expect(await computeDsn(T0, 3600, 0, MONTH, () => true)).toBeNull();
  });
});
