// Application state (zustand). The per-cell `score` and `excluded` buffers are allocated once per scenario and
// rewritten in place; `colourVersion` is the only signal the map needs to recolour.
import {create} from 'zustand';
import {MISSION_PRESETS} from '../components/artemis/presets';
import {FILTER_CONFIG, FILTER_IDS, KPI_IDS, type FilterId, type KpiId} from './kpiConfig';
import {loadScenario, type Scenario} from './loader';
import {computeKpis, filtersInto, scoreInto, type FilterState, type Kpis, type ScoreHint, type Weights} from './mcda';
import type {ColourField} from './metrics';

export const MAX_PINNED = 3;

export interface ValueRange {
  min: number;
  max: number;
}

/**
 * Writes `column` normalised to its min-max over non-null values into `out` (NaN for null; 0.5 when min = max).
 * Returns the range, or null when every value is null. No allocation.
 */
export function normaliseInto(column: ArrayLike<number | null>, out: Float32Array): ValueRange | null {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < column.length; i++) {
    const v = column[i];
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min > max) {
    out.fill(NaN);
    return null;
  }
  const span = max - min;
  for (let i = 0; i < column.length; i++) {
    const v = column[i];
    out[i] = v === null ? NaN : span === 0 ? 0.5 : (v - min) / span;
  }
  return {min, max};
}

/** Slider units 0..100; only the ratios matter. */
export const DEFAULT_WEIGHTS: Weights = {sun: 20, comms: 20, terrain: 20, ice: 20, protection: 20};

export function defaultFilters(): FilterState {
  const f = {} as FilterState;
  for (const id of FILTER_IDS) f[id] = {enabled: false, limit: FILTER_CONFIG[id].defaultLimit};
  return f;
}

export interface SeleneState {
  status: 'loading' | 'ready' | 'error';
  /** Readable message when `status` is 'error'. */
  error: string | null;
  scenario: Scenario | null;
  /** Row index into `scenario.cells`, or null. */
  selected: number | null;
  /** Row indexes of pinned cells, oldest first, at most MAX_PINNED. */
  pinned: number[];
  colourBy: ColourField;
  /** Per cell, 0..1 = position on the colour ramp, NaN = no value. Same buffer for the life of the scenario. */
  score: Float32Array;
  /** Per cell, non-zero = excluded by a hard filter (drawn grey). Same buffer for the life of the scenario. */
  excluded: Uint8Array;
  /** Physical range of the colour-by metric (legend); null for 'score' or when every value is null. */
  range: ValueRange | null;
  /** KPI arrays of the loaded scenario (computed once per load); null before. */
  kpis: Kpis | null;
  /** Slider values 0..100 per KPI. */
  weights: Weights;
  filters: FilterState;
  /** Per cell MCDA score 0..1 (NaN = none); rewritten in place by `rescore`, used for the ranking and the panels. */
  mcdaScore: Float32Array;
  /** Number of cells with `excluded` set. */
  excludedCount: number;
  scoreHint: ScoreHint;
  /** Set by `focusCell`: the map centres on this projected point (metres); `seq` makes repeats distinct. */
  focus: {index: number; seq: number} | null;
  /** Custom date range as ephemeris table row indices [startIndex, endIndex); null = the baseline scenario range. Set by W4. */
  customRange: {startIndex: number; endIndex: number} | null;
  /** Incremented whenever `score` or `excluded` changed in place: the map recolours on it. */
  colourVersion: number;

  load(dataUrl: string, scenarioId: string | null): Promise<void>;
  select(index: number | null): void;
  /** Pins the cell, or unpins it if already pinned. Returns false when MAX_PINNED cells are already pinned. */
  togglePin(index: number): boolean;
  setColourBy(field: ColourField): void;
  setWeight(kpi: KpiId, value: number): void;
  setFilter(id: FilterId, patch: Partial<{enabled: boolean; limit: number}>): void;
  applyPreset(presetId: string): void;
  /** Equal weights, all filters off. */
  resetMcda(): void;
  /** Selects the cell and asks the map to centre on it. */
  focusCell(index: number): void;
  /** Recomputes `mcdaScore`, `excluded` and the colours from the current weights and filters (in place). */
  rescore(): void;
  /** Refills `score` for the current colour-by field and bumps `colourVersion`. */
  recolour(): void;
  /** For callers that wrote `score` / `excluded` in place themselves (W2): tell the map to recolour. */
  bumpColours(): void;
}

export const useStore = create<SeleneState>()((set, get) => ({
  status: 'loading',
  error: null,
  scenario: null,
  selected: null,
  pinned: [],
  colourBy: 'score',
  score: new Float32Array(0),
  excluded: new Uint8Array(0),
  kpis: null,
  weights: {...DEFAULT_WEIGHTS},
  filters: defaultFilters(),
  mcdaScore: new Float32Array(0),
  excludedCount: 0,
  scoreHint: 'ok',
  focus: null,
  range: null,
  colourVersion: 0,
  customRange: null,

  async load(dataUrl, scenarioId) {
    set({status: 'loading', error: null});
    try {
      const scenario = await loadScenario(dataUrl, scenarioId);
      const n = scenario.grid.n_cells;
      set({
        scenario,
        selected: null,
        pinned: [],
        focus: null,
        customRange: null,
        kpis: computeKpis(scenario.cells),
        score: new Float32Array(n),
        mcdaScore: new Float32Array(n),
        excluded: new Uint8Array(n),
      });
      get().rescore();
      set({status: 'ready'});
    } catch (e) {
      set({status: 'error', error: e instanceof Error ? e.message : String(e)});
    }
  },

  select: (index) => set({selected: index}),

  togglePin(index) {
    const {pinned} = get();
    if (pinned.includes(index)) set({pinned: pinned.filter((i) => i !== index)});
    else if (pinned.length >= MAX_PINNED) return false;
    else set({pinned: [...pinned, index]});
    return true;
  },

  setColourBy(field) {
    set({colourBy: field});
    get().recolour();
  },

  setWeight(kpi, value) {
    set({weights: {...get().weights, [kpi]: value}});
    get().rescore();
  },

  setFilter(id, patch) {
    set({filters: {...get().filters, [id]: {...get().filters[id], ...patch}}});
    get().rescore();
  },

  applyPreset(presetId) {
    const preset = MISSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const weights = {} as Weights;
    for (const k of KPI_IDS) weights[k] = Math.round(preset.weights[k] * 100);
    const filters = {} as FilterState;
    for (const id of FILTER_IDS) {
      const limit = preset.filters[id];
      filters[id] = {enabled: limit !== undefined, limit: limit ?? get().filters[id].limit};
    }
    set({weights, filters});
    get().rescore();
  },

  resetMcda() {
    set({weights: {...DEFAULT_WEIGHTS}, filters: defaultFilters()});
    get().rescore();
  },

  focusCell(index) {
    set({selected: index, focus: {index, seq: (get().focus?.seq ?? 0) + 1}});
  },

  rescore() {
    const {scenario, kpis, weights, filters, mcdaScore, excluded} = get();
    if (!scenario || !kpis) return;
    const scoreHint = scoreInto(kpis, weights, mcdaScore);
    const excludedCount = filtersInto(scenario.cells, filters, excluded);
    set({scoreHint, excludedCount});
    get().recolour();
  },

  recolour() {
    const {scenario, colourBy, score, mcdaScore, colourVersion} = get();
    if (!scenario) return;
    let range: ValueRange | null = null;
    if (colourBy === 'score') score.set(mcdaScore);
    else range = normaliseInto(scenario.cells[colourBy], score);
    set({range, colourVersion: colourVersion + 1});
  },

  bumpColours: () => set({colourVersion: get().colourVersion + 1}),
}));
