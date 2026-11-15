// Loads the lazy horizon and ephemeris tables and computes, for one cell, the horizon, the Sun and Earth tracks over
// the active time range and the four date-dependent metrics, with the same functions the custom-dates worker uses.
import {useEffect, useState} from 'react';
import {bodyTrack, clipRange, rangeMetrics} from '../../services/ephemeris';
import {loadEphemeris, loadHorizons, type Scenario} from '../../services/loader';
import type {SeleneState} from '../../services/store';

/** At most this many points per body are drawn. */
export const MAX_TRACK_POINTS = 1500;

export interface CellSky {
  horizon_cdeg: Int16Array;
  sun: Float32Array;
  earth: Float32Array;
  /** UTC milliseconds of table row 0 and the table step, to turn the row index of a track point into a date. */
  t0_ms: number;
  step_s: number;
  /** Row range actually used (the active range clipped to the ephemeris table) and whether clipping happened. */
  range: {startIndex: number; endIndex: number; clipped: boolean};
  /** Recomputed: sun_pct, dark_max_h, earth_pct, earth_outage_max_h. */
  metrics: {sun_pct: number; dark_max_h: number; earth_pct: number; earth_outage_max_h: number};
}

export type SkyState =
  | {status: 'loading'}
  | {status: 'no-horizon'}
  | {status: 'error'; message: string}
  | {status: 'ready'; sky: CellSky};

/** Best point of the cell when the pipeline gave one, else the cell centre; height = mean elevation + observer height. */
export function cellPoint(scenario: Scenario, row: number) {
  const c = scenario.cells;
  return {
    lat_deg: c.best_lat[row] ?? c.lat[row],
    lon_deg: c.best_lon[row] ?? c.lon[row],
    height_m: (c.elev_m[row] ?? 0) + scenario.manifest.params.observer_height_m,
  };
}

export function useCellSky(
  scenario: Scenario,
  row: number | null,
  customRange: SeleneState['customRange'],
): SkyState {
  // The result is tagged with its inputs, so a stale result is never shown for another cell or range.
  const [done, setDone] = useState<{scenario: Scenario; row: number; start?: number; end?: number; state: SkyState} | null>(null);
  const startIndex = customRange?.startIndex;
  const endIndex = customRange?.endIndex;
  useEffect(() => {
    if (row === null) return;
    let cancelled = false;
    const finish = (state: SkyState) =>
      setDone({scenario, row, start: startIndex, end: endIndex, state});
    Promise.all([loadHorizons(scenario), loadEphemeris(scenario)])
      .then(([horizons, eph]) => {
        if (cancelled) return;
        const horizon_cdeg = horizons.row_cdeg(row);
        if (!horizon_cdeg) return finish({status: 'no-horizon'});
        const {time} = scenario.manifest;
        const want =
          startIndex === undefined || endIndex === undefined
            ? clipRange(eph.t0, eph.step_s, eph.n, time.start, time.end)
            : {startIndex, endIndex};
        const requested =
          startIndex === undefined || endIndex === undefined
            ? Math.round((Date.parse(time.end) - Date.parse(time.start)) / 1000 / eph.step_s)
            : endIndex - startIndex;
        const range = {...want, clipped: want.endIndex - want.startIndex < requested};
        const p = cellPoint(scenario, row);
        const m = new Float64Array(4);
        rangeMetrics(p.lat_deg, p.lon_deg, p.height_m, horizon_cdeg, eph.table, range.startIndex, range.endIndex, eph.step_s, m);
        const stride = Math.max(1, Math.ceil((range.endIndex - range.startIndex) / MAX_TRACK_POINTS));
        const track = (body: 'sun' | 'earth') =>
          bodyTrack(body, p.lat_deg, p.lon_deg, p.height_m, eph.table, range.startIndex, range.endIndex, stride);
        finish({
          status: 'ready',
          sky: {
            horizon_cdeg,
            sun: track('sun'),
            earth: track('earth'),
            t0_ms: Date.parse(eph.t0),
            step_s: eph.step_s,
            range,
            metrics: {sun_pct: m[0], dark_max_h: m[1], earth_pct: m[2], earth_outage_max_h: m[3]},
          },
        });
      })
      .catch((e: unknown) => !cancelled && finish({status: 'error', message: e instanceof Error ? e.message : String(e)}));
    return () => {
      cancelled = true;
    };
  }, [scenario, row, startIndex, endIndex]);
  const fresh = done && done.scenario === scenario && done.row === row && done.start === startIndex && done.end === endIndex;
  return fresh ? done.state : {status: 'loading'};
}
