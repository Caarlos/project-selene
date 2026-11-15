// Weight sliders, hard filters and the top-10 list (PLAN.md sections 7.1 and 7.2).
import {useMemo, useState} from 'react';
import {FILTER_CONFIG, FILTER_IDS, KPI_IDS, KPI_SETTING_LIMITS, kpiDescription} from '../../services/kpiConfig';
import {effectiveSettings, topCells, weightShares} from '../../services/mcda';
import {formatMetric} from '../../services/metrics';
import {useStore} from '../../services/store';

const REFERENCE_FIELDS = [
  ['iceDistanceScale_km', 'Ice distance for score 0', 'km'],
  ['iceIndexMin', 'Minimum ice index of an ice cell', ''],
  ['shieldingScale', 'Shielding for score 1: 1 − sky view', ''],
] as const;

/** Basis selector and the editable reference values of the KPIs (they recompute the KPIs, not just the scores). */
function KpiReference() {
  const settings = useStore((s) => s.kpiSettings);
  const custom = useStore((s) => s.customRange) !== null;
  const setSettings = useStore((s) => s.setKpiSettings);
  const reset = useStore((s) => s.resetKpiSettings);
  const [resets, setResets] = useState(0); // remounts the uncontrolled inputs after a reset
  const basis = effectiveSettings(settings, custom).sunCommsBasis;
  return (
    <div data-testid="kpi-reference" className="space-y-1 border-t border-slate-800 pt-2">
      <h3 className="font-semibold">Reference values</h3>
      <label className="block text-xs">
        <span className="text-slate-400">Sunlight and Earth visibility use </span>
        <select
          data-testid="basis-select"
          className="w-full rounded border border-slate-600 bg-slate-800 px-1 py-0.5 disabled:opacity-60"
          value={basis}
          disabled={custom}
          onChange={(e) => setSettings({sunCommsBasis: e.target.value as 'best' | 'mean'})}
        >
          <option value="best">Best point of the cell</option>
          <option value="mean">Mean over the cell</option>
        </select>
      </label>
      {custom && (
        <p className="text-xs text-amber-300" data-testid="basis-note">
          Mean values exist only for the baseline dates, so the best point is used for the custom range.
        </p>
      )}
      {REFERENCE_FIELDS.map(([id, label, unit]) => {
        const lim = KPI_SETTING_LIMITS[id];
        return (
          <label key={`${id}-${resets}`} className="flex items-center justify-between gap-2 text-xs">
            <span>{label}</span>
            <span>
              <input
                type="number"
                className="w-16 rounded border border-slate-600 bg-slate-900 px-1"
                data-testid={`ref-${id}`}
                min={lim.min}
                max={lim.max}
                step={lim.step}
                defaultValue={settings[id]}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (v >= lim.min && v <= lim.max) setSettings({[id]: v});
                }}
              />{' '}
              {unit}
            </span>
          </label>
        );
      })}
      <button
        type="button"
        data-testid="ref-reset"
        className="rounded border border-slate-600 px-2 py-0.5 text-xs hover:bg-slate-800"
        onClick={() => {
          reset();
          setResets(resets + 1);
        }}
      >
        Reset to defaults
      </button>
      <p className="text-xs text-slate-500">
        The safe-slope limit (10°) is fixed by the pipeline; changing it needs a new pipeline run.
      </p>
    </div>
  );
}

export function McdaWeights() {
  const weights = useStore((s) => s.weights);
  const kpis = useStore((s) => s.kpis);
  const hint = useStore((s) => s.scoreHint);
  const setWeight = useStore((s) => s.setWeight);
  const settings = useStore((s) => s.kpiSettings);
  const custom = useStore((s) => s.customRange) !== null;
  const resetMcda = useStore((s) => s.resetMcda);
  if (!kpis) return null;
  const share = weightShares(weights, kpis.available);
  return (
    <section data-testid="mcda-weights" className="space-y-2 text-sm">
      <h2 className="text-base font-semibold">Criteria weights</h2>
      {KPI_IDS.map((k) => {
        const def = kpiDescription(k, effectiveSettings(settings, custom));
        const ok = kpis.available[k];
        return (
          <div key={k} className={ok ? '' : 'opacity-60'}>
            <label className="flex justify-between" title={`${def.explanation} Unit: ${def.unit}.`}>
              <span>
                {def.label} <span className="text-xs text-slate-500">{def.module}</span>
              </span>
              <span data-testid={`share-${k}`}>{ok ? `${(100 * share[k]).toFixed(0)} %` : 'n/a'}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              className="w-full"
              aria-label={`${def.label} weight`}
              data-testid={`slider-${k}`}
              value={weights[k]}
              disabled={!ok}
              onChange={(e) => setWeight(k, e.target.valueAsNumber)}
            />
            {!ok && (
              <p className="text-xs text-amber-300">Unavailable: {def.inputs.join(', ')} is empty in this scenario.</p>
            )}
          </div>
        );
      })}
      {hint === 'zero-weights' && (
        <p role="note" data-testid="zero-weights-hint" className="text-xs text-amber-300">
          All weights are zero: every cell shows a neutral score. Raise a slider to rank cells.
        </p>
      )}
      <button
        type="button"
        data-testid="reset"
        className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
        onClick={resetMcda}
      >
        Reset weights and filters
      </button>
      <KpiReference />
    </section>
  );
}

export function HardFilters() {
  const filters = useStore((s) => s.filters);
  const excludedCount = useStore((s) => s.excludedCount);
  const setFilter = useStore((s) => s.setFilter);
  return (
    <section data-testid="hard-filters" className="space-y-2 text-sm">
      <h2 className="text-base font-semibold">Hard filters</h2>
      {FILTER_IDS.map((id) => {
        const def = FILTER_CONFIG[id];
        return (
          <div key={id} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Use filter: ${def.label}`}
              data-testid={`filter-on-${id}`}
              checked={filters[id].enabled}
              onChange={(e) => setFilter(id, {enabled: e.target.checked})}
            />
            <span className="flex-1">{def.label}</span>
            <input
              type="number"
              className="w-16 rounded border border-slate-600 bg-slate-900 px-1"
              aria-label={`${def.label} limit`}
              data-testid={`filter-limit-${id}`}
              value={filters[id].limit}
              step={def.unit === '0–1' ? 0.05 : 1}
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setFilter(id, {limit: e.target.valueAsNumber})}
            />
            <span className="w-4 text-slate-400">{def.unit === '0–1' ? '' : def.unit}</span>
          </div>
        );
      })}
      <p data-testid="excluded-count" className="text-slate-300">
        {excludedCount.toLocaleString('en-US')} cells excluded (shown grey)
      </p>
    </section>
  );
}

/** Top 10 cells by score, excluded cells left out. */
export function TopCells() {
  const scenario = useStore((s) => s.scenario);
  const version = useStore((s) => s.colourVersion);
  const focusCell = useStore((s) => s.focusCell);
  const top = useMemo(() => {
    const {mcdaScore, excluded} = useStore.getState();
    return topCells(mcdaScore, excluded, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the buffers change in place; `version` signals it
  }, [version]);
  const hint = useStore((s) => s.scoreHint);
  if (!scenario) return null;
  return (
    <section data-testid="top-cells" className="space-y-1 text-sm">
      <h2 className="text-base font-semibold">Top 10 cells</h2>
      {hint === 'zero-weights' ? (
        <p className="text-slate-400">No ranking while all weights are zero.</p>
      ) : (
        <ol className="space-y-0.5">
          {top.map((i, rank) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full justify-between rounded px-1 hover:bg-slate-800"
                onClick={() => focusCell(i)}
              >
                <span>
                  {rank + 1}. <code>{scenario.cells.h3[i]}</code>
                </span>
                <span>{formatMetric(useStore.getState().mcdaScore[i], '0–1')}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
