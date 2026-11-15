// Cell inspector (PLAN.md section 7.1): header, KPI bars, horizon chart with Sun and Earth tracks, raw metrics by module.
import {lazy, Suspense} from 'react';
import {KPI_CONFIG, KPI_IDS} from '../../services/kpiConfig';
import type {Scenario} from '../../services/loader';
import {docHref} from '../apollo/headings';
import {METRIC_INFO} from '../../services/metrics';
import {MAX_PINNED, useStore} from '../../services/store';
import {METRIC_GROUPS} from './metricGroups';
import {useCellSky, type CellSky} from './useCellSky';

const HorizonChart = lazy(() => import('./HorizonChart')); // ECharts stays out of the first-paint bundle

/** "12.34 %", "not available" for null / NaN. Fractions carry no unit. */
function show(value: number | null | undefined, unit: string, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'not available';
  const t = Math.abs(value) >= 1000 ? value.toFixed(0) : Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(digits);
  return unit === '0–1' ? t : `${t} ${unit}`;
}

const latText = (lat: number) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}`;
const lonText = (lon: number) => `${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`;

function Recomputed({sky, row, scenario}: {sky: CellSky; row: number; scenario: Scenario}) {
  const custom = useStore((s) => s.customRange) !== null;
  const c = scenario.cells; // always the loaded baseline: this column is labelled "Stored baseline"
  const {metrics: m, range} = sky;
  const rows: [string, string, number, number | null, string, string][] = [
    ['Sunlight', 'sun', m.sun_pct, c.sun_best_pct[row], '%', 'sun_best_pct'],
    ['Earth visible', 'earth', m.earth_pct, c.earth_best_pct[row], '%', 'earth_best_pct'],
    ['Longest darkness', 'dark', m.dark_max_h, c.dark_max_h_best[row], 'h', 'dark_max_h_best'],
    ['Longest Earth outage', 'outage', m.earth_outage_max_h, c.earth_outage_max_h_best[row], 'h', 'earth_outage_max_h_best'],
  ];
  return (
    <div className="mt-2 text-xs" data-testid="recomputed">
      <table className="w-full">
        <thead className="text-slate-400">
          <tr>
            <th className="text-left font-normal" />
            <th className="text-right font-normal">Recomputed here</th>
            <th className="text-right font-normal">Stored baseline</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, id, mine, stored, unit, col]) => (
            <tr key={id}>
              <td className="text-slate-400" title={METRIC_INFO[col as keyof typeof METRIC_INFO].label}>
                {label}
              </td>
              <td className="text-right" data-testid={`recomputed-${id}`}>
                {show(mine, unit)}
              </td>
              <td className="text-right" data-testid={`stored-${id}`}>
                {show(stored, unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-slate-400">
        Best-point horizon, rows {range.startIndex} to {range.endIndex} of the ephemeris table
        {range.clipped ? ' (range clipped to what the ephemeris covers)' : ''}.
        {custom ? ' The stored baseline covers the scenario dates, not this range.' : ''}
      </p>
    </div>
  );
}

function HorizonSection({scenario, row}: {scenario: Scenario; row: number}) {
  const customRange = useStore((s) => s.customRange);
  const state = useCellSky(scenario, row, customRange);
  return (
    <section data-testid="horizon-section">
      <h3 className="font-semibold">Horizon, Sun and Earth</h3>
      {state.status === 'loading' && <p className="text-slate-400">Loading horizon…</p>}
      {state.status === 'no-horizon' && (
        <p className="rounded bg-slate-800 p-2 text-slate-300" data-testid="no-horizon">
          This scenario has no horizon profile for this cell, so the chart and the recomputed values cannot be shown.
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="rounded bg-red-950 p-2 text-red-200">
          Could not load the horizon data: {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <Suspense fallback={<p className="text-slate-400">Loading chart…</p>}>
            <HorizonChart sky={state.sky} />
          </Suspense>
          <Recomputed sky={state.sky} row={row} scenario={scenario} />
        </>
      )}
    </section>
  );
}

export default function Inspector({scenario}: {scenario: Scenario}) {
  const selected = useStore((s) => s.selected);
  const pinned = useStore((s) => s.pinned);
  const togglePin = useStore((s) => s.togglePin);
  const kpis = useStore((s) => s.kpis);
  const custom = useStore((s) => s.customRange) !== null;
  useStore((s) => s.colourVersion); // score buffers change in place
  const {manifest} = scenario;
  const cells = useStore((s) => s.cells) ?? scenario.cells; // custom-range columns when a range is active

  if (selected === null) return <p className="text-slate-400">Click a cell on the map to inspect it.</p>;
  const {mcdaScore, excluded} = useStore.getState();
  return (
    <div className="space-y-4">
      {manifest.synthetic && (
        <p className="rounded bg-amber-900/40 p-2 text-xs text-amber-200" data-testid="synthetic-note">
          Synthetic scenario: every value and the horizon below are placeholders, not lunar measurements.
        </p>
      )}
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <code data-testid="selected-cell-id">{cells.h3[selected]}</code>
          <button
            type="button"
            data-testid="pin-button"
            className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40"
            disabled={!pinned.includes(selected) && pinned.length >= MAX_PINNED}
            title={`Pin to compare, up to ${MAX_PINNED} cells`}
            onClick={() => togglePin(selected)}
          >
            {pinned.includes(selected) ? 'Unpin' : 'Pin to compare'}
          </button>
        </div>
        <p className="text-slate-300">
          {latText(cells.lat[selected])}, {lonText(cells.lon[selected])}, elevation {show(cells.elev_m[selected], 'm')}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" data-testid="cell-score">
          <dt className="font-semibold">Score</dt>
          <dd className="text-right font-semibold" data-testid="cell-score-value">
            {show(mcdaScore[selected], '0–1')}
            {excluded[selected] ? ' (excluded by a filter)' : ''}
          </dd>
        </dl>
        {kpis &&
          KPI_IDS.map((k) => {
            const v = kpis.available[k] ? kpis.values[k][selected] : NaN;
            return (
              <div key={k} title={KPI_CONFIG[k].explanation}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{KPI_CONFIG[k].label}</span>
                  <span data-testid={`cell-kpi-${k}`}>{show(v, '0–1')}</span>
                </div>
                <div className="h-1.5 rounded bg-slate-800">
                  <div className="h-full rounded bg-sky-500" style={{width: `${Number.isFinite(v) ? v * 100 : 0}%`}} />
                </div>
              </div>
            );
          })}
      </header>

      <HorizonSection scenario={scenario} row={selected} />

      {METRIC_GROUPS.map((g) => (
        <section key={g.module} data-testid={`group-${g.module}`}>
          <h3 className="font-semibold">
            {g.module} <span className="font-normal text-slate-400">{g.title}</span>
          </h3>
          <dl className="mt-1 space-y-1.5">
            {g.metrics.map(({id, explanation, baselineOnly}) => (
              <div key={id}>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-300">
                    {METRIC_INFO[id].label}
                    {baselineOnly && custom && (
                      <span className="ml-1 rounded bg-slate-700 px-1 text-[10px] text-slate-200">baseline only</span>
                    )}
                    <a href={docHref('primer', id)} title={`Formula and data source of ${id}`} className="ml-1 text-sky-400 hover:underline">
                      ?
                    </a>
                  </dt>
                  <dd className="text-right" data-testid={`metric-${id}`}>
                    {show(cells[id][selected], METRIC_INFO[id].unit)}
                  </dd>
                </div>
                <p className="text-xs text-slate-500">{explanation}</p>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="text-xs text-slate-400">
        Horizon truncated by the DEM edge: {cells.horizon_truncated[selected] ? 'yes' : 'no'}
      </p>
    </div>
  );
}
