// Raw metrics of the inspector grouped by owning module (PLAN.md section 2), with one-line explanations.
import type {MetricColumn} from '../../services/types';

export interface MetricGroup {
  module: string;
  title: string;
  metrics: {id: MetricColumn; explanation: string; /** per-cell mean: not recomputed for a custom date range */ baselineOnly?: boolean}[];
}

export const METRIC_GROUPS: MetricGroup[] = [
  {
    module: 'EOS',
    title: 'Sunlight',
    metrics: [
      {id: 'sun_best_pct', explanation: 'Share of the date range with the Sun above the horizon at the best point.'},
      {id: 'sun_mean_pct', explanation: 'Same, averaged over the sample points of the cell.', baselineOnly: true},
      {id: 'dark_max_h_best', explanation: 'Longest continuous darkness at the best point.'},
      {id: 'dark_max_h_mean', explanation: 'Longest darkness, averaged over the cell sample points.', baselineOnly: true},
    ],
  },
  {
    module: 'HERMES',
    title: 'Earth link',
    metrics: [
      {id: 'earth_best_pct', explanation: 'Share of the date range with Earth above the horizon at the best point.'},
      {id: 'earth_mean_pct', explanation: 'Same, averaged over the cell sample points.', baselineOnly: true},
      {id: 'earth_outage_max_h_best', explanation: 'Longest continuous time without line of sight to Earth.'},
    ],
  },
  {
    module: 'ARGUS',
    title: 'Terrain and shielding',
    metrics: [
      {id: 'svf', explanation: 'Fraction of the sky open to view (1 = flat open terrain, low = well sheltered).'},
      {id: 'slope_mean_deg', explanation: 'Average ground slope in the cell.'},
      {id: 'slope_p95_deg', explanation: 'Slope exceeded by only 5 % of the cell.'},
      {id: 'safe_frac', explanation: 'Fraction of the cell below the safe-slope limit.'},
      {id: 'tri_m', explanation: 'Terrain ruggedness: mean height difference to neighbouring points.'},
    ],
  },
  {
    module: 'HESTIA',
    title: 'Ice and temperature',
    metrics: [
      {id: 'ice_index', explanation: 'Likelihood that surface ice is stable here (0 = none, 1 = most likely).'},
      {id: 'psr_frac', explanation: 'Fraction of the cell that never sees the Sun.'},
      {id: 'tmax_k', explanation: 'Hottest surface temperature reached.'},
      {id: 'tavg_k', explanation: 'Average surface temperature.'},
      {id: 'thermal_amp_k', explanation: 'Difference between hottest and coldest temperature.'},
    ],
  },
  {
    module: 'Location',
    title: 'Position',
    metrics: [
      {id: 'elev_m', explanation: 'Mean height above the 1,737.4 km reference sphere.'},
      {id: 'best_lat', explanation: 'Latitude of the cell sample point with the most sunlight (horizon used for the chart).'},
      {id: 'best_lon', explanation: 'Longitude of that best point, east-positive.'},
    ],
  },
];
