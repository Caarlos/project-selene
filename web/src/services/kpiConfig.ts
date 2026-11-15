// KPI anchors, definitions and hard-filter definitions (PLAN.md sections 7.1 and 7.2). Initial values: tune after the
// first real data run and record the change in HUMAN_ACTION.md.
import type {MetricColumn} from './types';

export const KPI_IDS = ['sun', 'comms', 'terrain', 'ice', 'protection'] as const;
export type KpiId = (typeof KPI_IDS)[number];

/** Fixed normalisation anchors. */
export const KPI_ANCHORS = {
  /** kpi_ice falls linearly from 1 (ice in the cell) to 0 at this surface distance, km. */
  iceDistanceScale_km: 30,
  /** A cell "bears ice" when ice_index is at least this. */
  iceIndexMin: 0.2,
  /** kpi_protection reaches 1 when (1 - svf) is at least this. */
  shieldingScale: 0.25,
} as const;

export interface KpiDefinition {
  label: string;
  /** Ecosystem module that owns the criterion (PLAN.md section 2). */
  module: string;
  /** What the 0..1 value is made of, as shown to the user. */
  unit: string;
  explanation: string;
  /** Contract columns the KPI reads; all null = KPI unavailable. */
  inputs: readonly MetricColumn[];
}

export const KPI_CONFIG: Record<KpiId, KpiDefinition> = {
  sun: {
    label: 'Sunlight',
    module: 'EOS',
    unit: 'best-point sunlight / 100',
    explanation: 'Share of the date range with the Sun above the horizon at the best point of the cell.',
    inputs: ['sun_best_pct'],
  },
  comms: {
    label: 'Earth communications',
    module: 'HERMES',
    unit: 'best-point Earth visibility / 100',
    explanation: 'Share of the date range with Earth above the horizon at the best point of the cell.',
    inputs: ['earth_best_pct'],
  },
  terrain: {
    label: 'Terrain safety',
    module: 'ARGUS',
    unit: 'safe-slope fraction',
    explanation: 'Fraction of the cell whose slope is below the safe-slope limit.',
    inputs: ['safe_frac'],
  },
  ice: {
    label: 'Ice proximity',
    module: 'HESTIA',
    unit: `1 at an ice cell, 0 at ${KPI_ANCHORS.iceDistanceScale_km} km or more`,
    explanation: `Closeness to the nearest cell with ice index of at least ${KPI_ANCHORS.iceIndexMin}, along the surface.`,
    inputs: ['ice_index'],
  },
  protection: {
    label: 'Shielding',
    module: 'ARGUS',
    unit: `(1 - sky view factor) / ${KPI_ANCHORS.shieldingScale}, at most 1`,
    explanation: 'How much of the sky the terrain blocks, as natural shelter from radiation and micrometeoroids.',
    inputs: ['svf'],
  },
};

export const FILTER_IDS = ['safe_frac', 'slope_p95_deg', 'dark_max_h_best', 'earth_best_pct'] as const;
export type FilterId = (typeof FILTER_IDS)[number];

export interface FilterDefinition {
  label: string;
  /** 'min': cells below the limit are excluded. 'max': cells above it are excluded. */
  kind: 'min' | 'max';
  unit: string;
  /** Limit shown when the filter has not been set yet. */
  defaultLimit: number;
}

/** The metric column of each filter is its id. */
export const FILTER_CONFIG: Record<FilterId, FilterDefinition> = {
  safe_frac: {label: 'Minimum safe-slope fraction', kind: 'min', unit: '0–1', defaultLimit: 0.5},
  slope_p95_deg: {label: 'Maximum slope (95th percentile)', kind: 'max', unit: '°', defaultLimit: 15},
  dark_max_h_best: {label: 'Maximum longest darkness', kind: 'max', unit: 'h', defaultLimit: 150},
  earth_best_pct: {label: 'Minimum Earth visibility', kind: 'min', unit: '%', defaultLimit: 50},
};
