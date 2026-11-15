// A/B comparator rows (PLAN.md section 7.4) and which value counts as best in each.
import type {KpiId} from '../../services/kpiConfig';
import type {MetricColumn} from '../../services/types';

export type Better = 'higher' | 'lower' | null;

export type CompareRow =
  | {kind: 'score'; label: string; better: 'higher'}
  | {kind: 'kpi'; id: KpiId; better: 'higher'}
  | {kind: 'metric'; id: MetricColumn; better: Better};

/** `null` = no preference (shown without highlight). Direction follows how the KPIs read each metric. */
export const COMPARE_ROWS: CompareRow[] = [
  {kind: 'score', label: 'Score', better: 'higher'},
  {kind: 'kpi', id: 'sun', better: 'higher'},
  {kind: 'kpi', id: 'comms', better: 'higher'},
  {kind: 'kpi', id: 'terrain', better: 'higher'},
  {kind: 'kpi', id: 'ice', better: 'higher'},
  {kind: 'kpi', id: 'protection', better: 'higher'},
  {kind: 'metric', id: 'sun_best_pct', better: 'higher'},
  {kind: 'metric', id: 'dark_max_h_best', better: 'lower'},
  {kind: 'metric', id: 'earth_best_pct', better: 'higher'},
  {kind: 'metric', id: 'earth_outage_max_h_best', better: 'lower'},
  {kind: 'metric', id: 'slope_p95_deg', better: 'lower'},
  {kind: 'metric', id: 'safe_frac', better: 'higher'},
  {kind: 'metric', id: 'svf', better: 'lower'},
  {kind: 'metric', id: 'thermal_amp_k', better: 'lower'},
  {kind: 'metric', id: 'ice_index', better: 'higher'},
  {kind: 'metric', id: 'elev_m', better: null},
];

/** Column positions holding the best value (ties all count); empty when there is no preference or fewer than 2 values. */
export function bestColumns(values: (number | null)[], better: Better): number[] {
  if (better === null) return [];
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return [];
  const best = better === 'higher' ? Math.max(...present) : Math.min(...present);
  return values.flatMap((v, i) => (v === best ? [i] : []));
}
