// Display metadata of the raw metric columns (units from the data contract table, PLAN.md section 6).
import type {MetricColumn} from './types';

export interface MetricInfo {
  label: string;
  /** Unit as shown to the user; '0–1' marks a dimensionless fraction or index. */
  unit: string;
}

export const METRIC_INFO: Record<MetricColumn, MetricInfo> = {
  elev_m: {label: 'Mean elevation', unit: 'm'},
  best_lat: {label: 'Best point latitude', unit: '°'},
  best_lon: {label: 'Best point longitude', unit: '°'},
  sun_best_pct: {label: 'Sunlight, best point', unit: '%'},
  sun_mean_pct: {label: 'Sunlight, cell mean', unit: '%'},
  dark_max_h_best: {label: 'Longest darkness, best point', unit: 'h'},
  dark_max_h_mean: {label: 'Longest darkness, cell mean', unit: 'h'},
  earth_best_pct: {label: 'Earth visibility, best point', unit: '%'},
  earth_mean_pct: {label: 'Earth visibility, cell mean', unit: '%'},
  earth_outage_max_h_best: {label: 'Longest Earth outage, best point', unit: 'h'},
  svf: {label: 'Sky view factor', unit: '0–1'},
  slope_mean_deg: {label: 'Mean slope', unit: '°'},
  slope_p95_deg: {label: 'Slope, 95th percentile', unit: '°'},
  safe_frac: {label: 'Safe-slope fraction', unit: '0–1'},
  tri_m: {label: 'Terrain ruggedness index', unit: 'm'},
  tmax_k: {label: 'Maximum temperature', unit: 'K'},
  tavg_k: {label: 'Average temperature', unit: 'K'},
  thermal_amp_k: {label: 'Thermal amplitude', unit: 'K'},
  psr_frac: {label: 'Permanently shadowed fraction', unit: '0–1'},
  ice_index: {label: 'Ice stability index', unit: '0–1'},
};

/** Columns offered in "colour by": every raw metric; the best-point coordinates are a location, not a metric. */
export const COLOUR_METRICS = (Object.keys(METRIC_INFO) as MetricColumn[]).filter(
  (k) => k !== 'best_lat' && k !== 'best_lon',
);

/** What the map is coloured by: the MCDA score (filled by task W2) or one raw metric. */
export type ColourField = 'score' | MetricColumn;

/** "12.3 %", "0.42" (fractions carry no unit suffix), "n/a" for null. */
export function formatMetric(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const text = Math.abs(value) >= 1000 ? value.toFixed(0) : Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return unit === '0–1' ? text : `${text} ${unit}`;
}
