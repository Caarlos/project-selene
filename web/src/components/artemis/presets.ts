// Mission presets (PLAN.md section 7.4). The values are this project's own editorial assumptions, not NASA requirements.
import type {FilterId, KpiId} from '../../services/kpiConfig';

export interface MissionPreset {
  id: string;
  label: string;
  /** Weights as in the table, 0..1; the sliders show them x 100. */
  weights: Record<KpiId, number>;
  /** Filters switched on with this limit; every other filter is switched off. */
  filters: Partial<Record<FilterId, number>>;
}

export const MISSION_PRESETS: readonly MissionPreset[] = [
  {
    id: 'artemis4',
    label: 'Artemis IV (crewed sortie)',
    weights: {sun: 0.3, comms: 0.3, terrain: 0.3, ice: 0.05, protection: 0.05},
    filters: {slope_p95_deg: 10, earth_best_pct: 50},
  },
  {
    id: 'clps',
    label: 'CLPS (ice prospecting rover)',
    weights: {sun: 0.15, comms: 0.15, terrain: 0.2, ice: 0.5, protection: 0},
    filters: {slope_p95_deg: 15},
  },
  {
    id: 'basecamp',
    label: 'Base Camp (permanent habitat)',
    weights: {sun: 0.3, comms: 0.15, terrain: 0.15, ice: 0.25, protection: 0.15},
    filters: {dark_max_h_best: 150},
  },
];
