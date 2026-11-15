// ARTEMIS date control (PLAN.md 7.3): custom date range computed in the browser, with progress, cancel and the
// fidelity note. Dates are UTC days, both included.
import {useState} from 'react';
import type {Scenario} from '../../services/loader';
import {addDays, isoDay, lunarMonthEnd, MAX_RANGE_DAYS, monthRange, validateRange} from '../../services/rangeProtocol';
import {useStore} from '../../services/store';

/** Header element: the range being analysed, "custom" and "computing…" marked; a click opens the Dates tab. */
export function HeaderDates({scenario}: {scenario: Scenario}) {
  const {t0, step_s} = scenario.manifest.ephemeris;
  const {time} = scenario.manifest;
  const customRange = useStore((s) => s.customRange);
  const status = useStore((s) => s.customStatus);
  const setTab = useStore((s) => s.setPanelTab);
  const day = (index: number) => isoDay(Date.parse(t0) + index * step_s * 1000);
  return (
    <button
      type="button"
      data-testid="date-range"
      title="Change the date range"
      className="rounded px-1 text-left hover:bg-slate-800"
      onClick={() => setTab('Dates')}
    >
      <span className="text-slate-400">Dates (UTC) </span>
      {customRange ? (
        <>
          <span className="rounded bg-sky-700 px-1 text-xs font-semibold uppercase">custom</span>{' '}
          {day(customRange.startIndex)} to {day(customRange.endIndex - 1)} (both included)
        </>
      ) : (
        `${time.start.slice(0, 10)} to ${time.end.slice(0, 10)} (end exclusive)`
      )}
      {status.phase === 'computing' && (
        <span className="ml-2 text-amber-300" data-testid="header-computing">
          computing… {Math.round(status.progress * 100)} %
        </span>
      )}
    </button>
  );
}

const btn = 'rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40';

export default function DateControl({scenario}: {scenario: Scenario}) {
  const {t0, step_s, n} = scenario.manifest.ephemeris;
  const t0_ms = Date.parse(t0);
  const first = isoDay(t0_ms);
  const last = isoDay(t0_ms + n * step_s * 1000 - 86_400_000);
  const baseStart = isoDay(Date.parse(scenario.manifest.time.start));
  const baseYear = new Date(scenario.manifest.time.start).getUTCFullYear();
  const customRange = useStore((s) => s.customRange);
  // the tab remounts this component: start from the active range, else the baseline start
  const day = (index: number) => isoDay(t0_ms + index * step_s * 1000);
  const [start, setStart] = useState(customRange ? day(customRange.startIndex) : baseStart);
  const [end, setEnd] = useState(customRange ? day(customRange.endIndex - 1) : lunarMonthEnd(baseStart));
  const status = useStore((s) => s.customStatus);
  const missing = useStore((s) => s.customMissing);
  const apply = useStore((s) => s.applyCustomRange);
  const cancel = useStore((s) => s.cancelCustomRange);
  const clear = useStore((s) => s.clearCustomRange);
  const check = validateRange(t0, step_s, n, start, end);
  const computing = status.phase === 'computing';
  const nHorizon = scenario.grid.horizons_n_cells ?? scenario.grid.n_cells;

  /** Preset: fill the inputs and apply in one click (an invalid range only fills them and shows the error). */
  const run = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
    const v = validateRange(t0, step_s, n, s, e);
    if (v.ok) void apply(v.startIndex, v.endIndex);
  };

  const activeText = customRange ? `${day(customRange.startIndex)} to ${day(customRange.endIndex - 1)}` : null;

  return (
    <section className="space-y-2" data-testid="date-control">
      <h3 className="font-semibold">Date range (UTC)</h3>
      <p className="text-xs text-slate-400" data-testid="date-active">
        {activeText ? `Custom range active: ${activeText}.` : 'Baseline scenario dates.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          Start
          <input
            type="date"
            data-testid="date-start"
            className="mt-0.5 w-full rounded bg-slate-800 px-1 py-0.5 text-slate-100"
            value={start}
            min={first}
            max={last}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400">
          End (included)
          <input
            type="date"
            data-testid="date-end"
            className="mt-0.5 w-full rounded bg-slate-800 px-1 py-0.5 text-slate-100"
            value={end}
            min={first}
            max={last}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        <button type="button" className={btn} data-testid="date-baseline" onClick={clear}>
          Baseline
        </button>
        <button
          type="button"
          className={btn}
          data-testid="date-lunar"
          title="30 days from the start date (a lunar month is 29.53 days)"
          onClick={() => run(start, lunarMonthEnd(start))}
        >
          Next lunar month from start
        </button>
        {([[1, 'south summer'], [4, 'autumn'], [7, 'south winter'], [10, 'spring']] as const).map(([m, season]) => {
          const r = monthRange(baseYear, m);
          return (
            <button
              key={m}
              type="button"
              className={btn}
              title={`Apply ${r.start} to ${r.end}`}
              onClick={() => run(r.start, r.end)}
            >
              {new Date(Date.UTC(baseYear, m - 1, 1)).toLocaleString('en', {month: 'short', timeZone: 'UTC'})} {baseYear} ({season})
            </button>
          );
        })}
        <button type="button" className={btn} onClick={() => run(start, addDays(start, MAX_RANGE_DAYS - 1))}>
          One year
        </button>
      </div>
      {!check.ok && (
        <p className="text-xs text-amber-300" data-testid="date-error">
          {check.error}
        </p>
      )}
      <button
        type="button"
        data-testid="date-apply"
        className="rounded bg-sky-700 px-3 py-1 text-sm font-semibold hover:bg-sky-600 disabled:opacity-40"
        disabled={!check.ok || computing}
        onClick={() => check.ok && void apply(check.startIndex, check.endIndex)}
      >
        Apply
      </button>
      {computing && (
        <div className="space-y-1" data-testid="date-progress-box">
          <progress className="w-full" max={1} value={status.progress} data-testid="date-progress" />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span data-testid="date-progress-text">Computing {Math.round(status.progress * 100)} %</span>
            <button type="button" className={btn} data-testid="date-cancel" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {status.phase === 'error' && (
        <p role="alert" className="rounded bg-red-950 p-2 text-xs text-red-200">
          {status.message}
        </p>
      )}
      {customRange && (
        <div className="space-y-1 rounded bg-slate-800 p-2 text-xs text-slate-300" data-testid="date-note">
          <p>
            Custom-date values use each cell&apos;s best-point horizon. Per-cell mean metrics are baseline only. For the full
            fidelity scenario run <code>python -m pipeline.selene_build --start-date … --end-date …</code>.
          </p>
          {missing > 0 && (
            <p data-testid="date-missing">
              {missing} of {scenario.grid.n_cells} cells have no horizon profile in this scenario ({nHorizon} have one) and
              show no value for the custom range.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
