// Placeholder cell panel: raw metrics of the selected cell. The full inspector (horizon chart) is task W3.
import type {Scenario} from '../../services/loader';
import {formatMetric, METRIC_INFO} from '../../services/metrics';
import {KPI_CONFIG, KPI_IDS} from '../../services/kpiConfig';
import {MAX_PINNED, useStore} from '../../services/store';
import {NULLABLE_METRIC_COLUMNS} from '../../services/types';
import {Slot} from './Slots';

export default function CellPanel({scenario}: {scenario: Scenario}) {
  const selected = useStore((s) => s.selected);
  const pinned = useStore((s) => s.pinned);
  const select = useStore((s) => s.select);
  const togglePin = useStore((s) => s.togglePin);
  const kpis = useStore((s) => s.kpis);
  useStore((s) => s.colourVersion); // score buffers change in place
  const {cells} = scenario;

  return (
    <div className="space-y-4 text-sm" data-testid="cell-panel">
      <h2 className="text-base font-semibold">Cell</h2>
      {selected === null ? (
        <p className="text-slate-400">Click a cell on the map to see its metrics.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <code data-testid="selected-cell-id">{cells.h3[selected]}</code>
            <button
              type="button"
              className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40"
              disabled={!pinned.includes(selected) && pinned.length >= MAX_PINNED}
              title={`Up to ${MAX_PINNED} pinned cells`}
              onClick={() => togglePin(selected)}
            >
              {pinned.includes(selected) ? 'Unpin' : 'Pin'}
            </button>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" data-testid="cell-score">
            <dt className="font-semibold">Score</dt>
            <dd className="text-right font-semibold" data-testid="cell-score-value">
              {formatMetric(useStore.getState().mcdaScore[selected], '0–1')}
              {useStore.getState().excluded[selected] ? ' (excluded by a filter)' : ''}
            </dd>
            {kpis &&
              KPI_IDS.map((k) => (
                <div key={k} className="contents">
                  <dt className="text-slate-400" title={KPI_CONFIG[k].explanation}>
                    {KPI_CONFIG[k].label} KPI
                  </dt>
                  <dd className="text-right" data-testid={`cell-kpi-${k}`}>
                    {formatMetric(kpis.available[k] ? kpis.values[k][selected] : null, '0–1')}
                  </dd>
                </div>
              ))}
          </dl>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-slate-400">Centre latitude</dt>
            <dd className="text-right">{formatMetric(cells.lat[selected], '°')}</dd>
            <dt className="text-slate-400">Centre longitude (east)</dt>
            <dd className="text-right">{formatMetric(cells.lon[selected], '°')}</dd>
            {NULLABLE_METRIC_COLUMNS.map((k) => (
              <div key={k} className="contents">
                <dt className="text-slate-400">{METRIC_INFO[k].label}</dt>
                <dd className="text-right">{formatMetric(cells[k][selected], METRIC_INFO[k].unit)}</dd>
              </div>
            ))}
            <dt className="text-slate-400">Horizon truncated by the DEM edge</dt>
            <dd className="text-right">{cells.horizon_truncated[selected] ? 'yes' : 'no'}</dd>
          </dl>
        </>
      )}
      {pinned.length > 0 && (
        <div>
          <h3 className="font-semibold">Pinned</h3>
          <ul className="mt-1 space-y-1">
            {pinned.map((i) => (
              <li key={i}>
                <button type="button" className="underline decoration-amber-500" onClick={() => select(i)}>
                  <code>{cells.h3[i]}</code>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Slot name="horizon-chart" task="W3" title="Horizon chart and full inspector" />
    </div>
  );
}
