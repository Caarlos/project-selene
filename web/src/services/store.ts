// Application state (zustand). The per-cell `score` and `excluded` buffers are allocated once per scenario and
// rewritten in place; `colourVersion` is the only signal the map needs to recolour.
import {create} from 'zustand';
import {MISSION_PRESETS} from '../components/artemis/presets';
import {DEFAULT_KPI_SETTINGS, FILTER_CONFIG, FILTER_IDS, KPI_IDS, type FilterId, type KpiId, type KpiSettings} from './kpiConfig';
import {cellPoint} from '../components/astraea/useCellSky';
import {countMissing} from './customCells';
import {maskedRows, maskKpis, viewCells} from './detail';
import {loadEphemeris, loadHorizons, loadPatch, loadScenario, type Scenario} from './loader';
import {computeKpis, effectiveSettings, filtersInto, scoreInto, type FilterState, type Kpis, type ScoreHint, type Weights} from './mcda';
import type {ColourField} from './metrics';
import {startRangeJob, type RangeJob} from './rangeRunner';
import type {RangeValues} from './rangeProtocol';
import type {Cells} from './types';

export const MAX_PINNED = 3;
export const PANEL_TABS = ['Inspector', 'Mission tools', 'Compare', 'Dates'] as const;

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

export type CustomStatus =
  | {phase: 'idle'}
  | {phase: 'computing'; progress: number}
  | {phase: 'error'; message: string};

let job: RangeJob | null = null; // the running custom-range computation, if any
let wantedDetail: string | null = null; // the patch the map last asked for
let jobSeq = 0; // bumped by every apply / cancel / clear, so a stale async continuation can tell

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
  /** Active tab of the right-hand panel; the header date range sets it to 'Dates'. */
  panelTab: (typeof PANEL_TABS)[number];
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
  /** User reference values and the best-point / cell-mean choice. Use `effectiveSettings` to read the ones in force. */
  kpiSettings: KpiSettings;
  filters: FilterState;
  /** Per cell MCDA score 0..1 (NaN = none); rewritten in place by `rescore`, used for the ranking and the panels. */
  mcdaScore: Float32Array;
  /** Number of cells with `excluded` set. */
  excludedCount: number;
  scoreHint: ScoreHint;
  /** Set by `focusCell`: the map centres on this projected point (metres); `seq` makes repeats distinct. */
  focus: {index: number; seq: number} | null;
  /** Custom date range as ephemeris table row indices [startIndex, endIndex); null = the baseline scenario range. */
  customRange: {startIndex: number; endIndex: number} | null;
  /** The cells every reader uses: `scenario.cells` with the custom-range columns when `customRange` is set and the rows of the grid not shown blanked (null). */
  cells: Cells | null;
  /** Values of the custom range for every row of `scenario.cells`; null = baseline. */
  customValues: RangeValues | null;
  /** Id of the detail patch shown instead of the overview cells it covers, or null (overview only). */
  detail: string | null;
  /** Set when a detail patch could not be loaded. */
  detailError: string | null;
  /** KPIs of the loaded baseline, kept so "Baseline" restores instantly. */
  baselineKpis: Kpis | null;
  customStatus: CustomStatus;
  /** Cells that have no horizon row, hence null for the custom range; 0 when no custom range is active. */
  customMissing: number;
  /** Incremented whenever `score` or `excluded` changed in place: the map recolours on it. */
  colourVersion: number;

  /** Computes the metrics of all cells that have a horizon over the row range in workers; replaces any running job. */
  applyCustomRange(startIndex: number, endIndex: number): Promise<void>;
  /** Stops a running computation; the active range is unchanged. */
  cancelCustomRange(): void;
  /** Back to the baseline scenario range: restores the loaded columns and KPIs, cancels a running job. */
  clearCustomRange(): void;
  load(dataUrl: string, scenarioId: string | null): Promise<void>;
  /** Shows detail patch `id` (null = overview only), loading its cells on first use; the map calls this on zoom and pan. */
  showDetail(id: string | null): Promise<void>;
  select(index: number | null): void;
  /** Pins the cell, or unpins it if already pinned. Returns false when MAX_PINNED cells are already pinned. */
  togglePin(index: number): boolean;
  setColourBy(field: ColourField): void;
  setPanelTab(tab: (typeof PANEL_TABS)[number]): void;
  setWeight(kpi: KpiId, value: number): void;
  /** Changes reference values: recomputes the KPIs (incl. nearest-ice distances), then rescores. Not for weight moves. */
  setKpiSettings(patch: Partial<KpiSettings>): void;
  resetKpiSettings(): void;
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

/** Rebuilds `cells` and the KPIs for the shown grid, custom range and reference values, then rescores (in place). */
function refreshView(): void {
  const {scenario, customValues, customRange, detail, kpiSettings, selected, pinned} = useStore.getState();
  if (!scenario) return;
  const rows = maskedRows(scenario, detail, selected === null ? pinned : [...pinned, selected]);
  const cells = viewCells(scenario, customValues, rows);
  const kpis = maskKpis(computeKpis(cells, effectiveSettings(kpiSettings, customRange !== null)), rows);
  useStore.setState({cells, kpis, baselineKpis: customRange ? null : kpis});
  useStore.getState().rescore();
}

export const useStore = create<SeleneState>()((set, get) => ({
  status: 'loading',
  error: null,
  scenario: null,
  selected: null,
  pinned: [],
  colourBy: 'score',
  panelTab: 'Inspector',
  score: new Float32Array(0),
  excluded: new Uint8Array(0),
  kpis: null,
  weights: {...DEFAULT_WEIGHTS},
  kpiSettings: {...DEFAULT_KPI_SETTINGS},
  filters: defaultFilters(),
  mcdaScore: new Float32Array(0),
  excludedCount: 0,
  scoreHint: 'ok',
  focus: null,
  range: null,
  colourVersion: 0,
  customRange: null,
  cells: null,
  customValues: null,
  detail: null,
  detailError: null,
  baselineKpis: null,
  customStatus: {phase: 'idle'},
  customMissing: 0,

  async load(dataUrl, scenarioId) {
    set({status: 'loading', error: null});
    try {
      const scenario = await loadScenario(dataUrl, scenarioId);
      const n = scenario.grid.n_cells;
      jobSeq++;
      job?.cancel();
      job = null;
      wantedDetail = null;
      const kpis = computeKpis(scenario.cells, effectiveSettings(get().kpiSettings, false));
      set({
        cells: scenario.cells,
        customValues: null,
        detail: null,
        detailError: null,
        baselineKpis: kpis,
        customStatus: {phase: 'idle'},
        customMissing: 0,
        scenario,
        selected: null,
        pinned: [],
        focus: null,
        customRange: null,
        kpis,
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

  async showDetail(id) {
    if (id === wantedDetail) return;
    wantedDetail = id;
    const {scenario} = get();
    if (!scenario) return;
    if (id && !scenario.grids.some((g) => g.grid.id === id)) {
      try {
        const next = await loadPatch(scenario, id);
        if (wantedDetail !== id || get().scenario !== scenario) return; // the view moved on, or another scenario was loaded
        const n = next.cells.h3.length;
        const range = get().customRange;
        jobSeq++;
        job?.cancel();
        job = null;
        // custom values cover the old rows only: back to baseline until the job below has run over all rows
        set({scenario: next, score: new Float32Array(n), mcdaScore: new Float32Array(n), excluded: new Uint8Array(n),
             customRange: null, customValues: null, customMissing: 0, customStatus: {phase: 'idle'}, detail: id, detailError: null});
        refreshView();
        if (range) void get().applyCustomRange(range.startIndex, range.endIndex);
      } catch (e) {
        if (wantedDetail === id) wantedDetail = null;
        set({detailError: e instanceof Error ? e.message : String(e)});
      }
      return;
    }
    set({detail: id});
    refreshView();
  },

  async applyCustomRange(startIndex, endIndex) {
    const {scenario} = get();
    if (!scenario) return;
    job?.cancel();
    const seq = ++jobSeq;
    set({customStatus: {phase: 'computing', progress: 0}});
    try {
      const [horizons, eph] = await Promise.all([loadHorizons(scenario), loadEphemeris(scenario)]);
      if (seq !== jobSeq || get().scenario !== scenario) return;
      const mine = startRangeJob({
        startIndex,
        endIndex,
        step_s: eph.step_s,
        table: eph.table,
        horizons,
        nCells: scenario.cells.h3.length,
        point(row) {
          const p = cellPoint(scenario, row);
          return {lat_deg: p.lat_deg, lon_deg: p.lon_deg, height_m: p.height_m};
        },
        onProgress: (progress) => job === mine && set({customStatus: {phase: 'computing', progress}}),
      });
      job = mine;
      const values = await mine.done;
      if (job !== mine) return; // cancelled or replaced
      job = null;
      if (values === null) return;
      set({customRange: {startIndex, endIndex}, customValues: values, customMissing: countMissing(values), customStatus: {phase: 'idle'}});
      refreshView();
    } catch (e) {
      if (seq !== jobSeq) return;
      job = null;
      set({customStatus: {phase: 'error', message: e instanceof Error ? e.message : String(e)}});
    }
  },

  cancelCustomRange() {
    jobSeq++;
    job?.cancel();
    job = null;
    set({customStatus: {phase: 'idle'}});
  },

  clearCustomRange() {
    jobSeq++;
    job?.cancel();
    job = null;
    set({customRange: null, customValues: null, customMissing: 0, customStatus: {phase: 'idle'}});
    refreshView();
  },

  select: (index) => set({selected: index}),

  togglePin(index) {
    const {pinned} = get();
    if (pinned.includes(index)) set({pinned: pinned.filter((i) => i !== index)});
    else if (pinned.length >= MAX_PINNED) return false;
    else set({pinned: [...pinned, index]});
    return true;
  },

  setPanelTab: (panelTab) => set({panelTab}),

  setColourBy(field) {
    set({colourBy: field});
    get().recolour();
  },

  setWeight(kpi, value) {
    set({weights: {...get().weights, [kpi]: value}});
    get().rescore();
  },

  setKpiSettings(patch) {
    set({kpiSettings: {...get().kpiSettings, ...patch}});
    refreshView();
  },

  resetKpiSettings() {
    get().setKpiSettings({...DEFAULT_KPI_SETTINGS});
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
    const cells = get().cells ?? scenario.cells;
    const scoreHint = scoreInto(kpis, weights, mcdaScore);
    const excludedCount = filtersInto(cells, filters, excluded);
    set({scoreHint, excludedCount});
    get().recolour();
  },

  recolour() {
    const {scenario, colourBy, score, mcdaScore, colourVersion} = get();
    if (!scenario) return;
    const cells = get().cells ?? scenario.cells;
    let range: ValueRange | null = null;
    if (colourBy === 'score') score.set(mcdaScore);
    else range = normaliseInto(cells[colourBy], score);
    set({range, colourVersion: colourVersion + 1});
  },

  bumpColours: () => set({colourVersion: get().colourVersion + 1}),
}));
