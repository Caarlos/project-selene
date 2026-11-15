// Read path of custom date ranges: the loaded baseline columns are never mutated; the four date-dependent columns of
// a custom range live in separate arrays and a shallow copy of the cells reads them instead.
import {RANGE_COLUMNS, type RangeValues} from './rangeProtocol';
import type {Cells} from './types';

/** `base` with the four best-point columns replaced by `values` (NaN becomes null). All other columns are shared. */
export function withRangeValues(base: Cells, values: RangeValues): Cells {
  const out: Cells = {...base};
  for (const c of RANGE_COLUMNS) out[c] = Array.from(values[c], (v) => (Number.isNaN(v) ? null : v));
  return out;
}

/** Number of cells whose custom-range value is null. */
export function countMissing(values: RangeValues): number {
  const col = values.sun_best_pct;
  let n = 0;
  for (let i = 0; i < col.length; i++) if (Number.isNaN(col[i])) n++;
  return n;
}
