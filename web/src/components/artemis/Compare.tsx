// A/B comparator (PLAN.md section 7.4): pinned cells side by side, best value per row highlighted.
import {KPI_CONFIG} from '../../services/kpiConfig';
import type {Scenario} from '../../services/loader';
import {formatMetric, METRIC_INFO} from '../../services/metrics';
import {MAX_PINNED, useStore} from '../../services/store';
import {bestColumns, COMPARE_ROWS, type CompareRow} from './comparator';

export default function Compare({scenario}: {scenario: Scenario}) {
  const pinned = useStore((s) => s.pinned);
  const togglePin = useStore((s) => s.togglePin);
  const select = useStore((s) => s.select);
  const kpis = useStore((s) => s.kpis);
  useStore((s) => s.colourVersion); // score buffers change in place
  const cells = useStore((s) => s.cells) ?? scenario.cells; // custom-range columns when a range is active
  const {mcdaScore} = useStore.getState();

  if (pinned.length === 0) {
    return (
      <p className="text-slate-400" data-testid="compare-empty">
        Select a cell and press &quot;Pin to compare&quot; in the inspector. Up to {MAX_PINNED} cells can be compared.
      </p>
    );
  }
  const value = (row: CompareRow, i: number): {v: number | null; text: string} => {
    if (row.kind === 'score') {
      const v = Number.isNaN(mcdaScore[i]) ? null : mcdaScore[i];
      return {v, text: formatMetric(v, '0–1')};
    }
    if (row.kind === 'kpi') {
      const v = kpis && kpis.available[row.id] && !Number.isNaN(kpis.values[row.id][i]) ? kpis.values[row.id][i] : null;
      return {v, text: formatMetric(v, '0–1')};
    }
    const v = cells[row.id][i];
    return {v, text: formatMetric(v, METRIC_INFO[row.id].unit)};
  };
  const label = (row: CompareRow) =>
    row.kind === 'score' ? row.label : row.kind === 'kpi' ? `${KPI_CONFIG[row.id].label} KPI` : METRIC_INFO[row.id].label;

  return (
    <div className="space-y-2">
      <table className="w-full text-xs" data-testid="compare-table">
        <thead>
          <tr className="align-bottom">
            <th className="text-left font-normal text-slate-400">Cell</th>
            {pinned.map((i) => (
              <th key={i} className="px-1 text-right font-normal" data-testid="compare-col">
                <button type="button" className="underline decoration-amber-500" onClick={() => select(i)}>
                  <code className="text-[10px]">{cells.h3[i].slice(0, 9)}</code>
                </button>
                <button
                  type="button"
                  aria-label={`Unpin ${cells.h3[i]}`}
                  data-testid="unpin"
                  className="ml-1 rounded border border-slate-600 px-1 hover:bg-slate-800"
                  onClick={() => togglePin(i)}
                >
                  ×
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => {
            const vals = pinned.map((i) => value(row, i));
            const best = bestColumns(vals.map((x) => x.v), row.better);
            return (
              <tr key={row.kind === 'score' ? 'score' : `${row.kind}-${row.id}`} className="border-t border-slate-800">
                <td className="py-0.5 text-slate-400" title={row.better ? `${row.better} is better` : 'no preferred direction'}>
                  {label(row)}
                </td>
                {vals.map((x, c) => (
                  <td
                    key={pinned[c]}
                    className={`px-1 text-right ${best.includes(c) ? 'font-semibold text-emerald-300' : ''}`}
                    data-best={best.includes(c) ? 'true' : undefined}
                  >
                    {x.text}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">
        Green marks the best value in a row (higher or lower depending on the metric; no marker where neither is better).
      </p>
    </div>
  );
}
