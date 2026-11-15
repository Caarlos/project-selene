// Polar seasons from the ephemeris table (5 floats per row: sub-solar lon, sub-solar lat, ...; see ephemeris.ts).
// Negative sub-solar latitude = the Sun is over the south: south-pole summer.

/** Mean sub-solar latitude (deg) of each calendar month of `year` (UTC); NaN for a month with no table row. */
export function monthMeanSubSolarLat_deg(table: Float32Array, t0_ms: number, step_s: number, n: number, year: number): number[] {
  const sum = new Float64Array(12);
  const count = new Float64Array(12);
  for (let i = 0; i < n; i++) {
    const d = new Date(t0_ms + i * step_s * 1000);
    if (d.getUTCFullYear() !== year) continue;
    sum[d.getUTCMonth()] += table[i * 5 + 1];
    count[d.getUTCMonth()]++;
  }
  return Array.from(sum, (s, m) => (count[m] ? s / count[m] : NaN));
}

/** Calendar months (1..12) with the most negative (polar summer) and most positive (polar winter) mean; null if no data. */
export function extremeMonths(means: number[]): {summer: number; winter: number} | null {
  const ok = means.map((v, m) => [v, m + 1] as const).filter(([v]) => !Number.isNaN(v));
  if (ok.length === 0) return null;
  const by = (sign: number) => ok.reduce((a, b) => (sign * b[0] > sign * a[0] ? b : a))[1];
  return {summer: by(-1), winter: by(1)};
}
