// Application state (zustand). The per-cell `score` and `excluded` buffers are allocated once per scenario and
// rewritten in place; `colourVersion` is the only signal the map needs to recolour.
import {create} from 'zustand';
import {loadScenario, type Scenario} from './loader';
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
  /** Incremented whenever `score` or `excluded` changed in place: the map recolours on it. */
  colourVersion: number;

  load(dataUrl: string, scenarioId: string | null): Promise<void>;
  select(index: number | null): void;
  /** Pins the cell, or unpins it if already pinned. Returns false when MAX_PINNED cells are already pinned. */
  togglePin(index: number): boolean;
  setColourBy(field: ColourField): void;
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
  // W2: switch the default to 'score' once the MCDA engine fills it.
  colourBy: 'sun_best_pct',
  score: new Float32Array(0),
  excluded: new Uint8Array(0),
  range: null,
  colourVersion: 0,

  async load(dataUrl, scenarioId) {
    set({status: 'loading', error: null});
    try {
      const scenario = await loadScenario(dataUrl, scenarioId);
      const n = scenario.grid.n_cells;
      set({scenario, selected: null, pinned: [], score: new Float32Array(n), excluded: new Uint8Array(n)});
      get().recolour();
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

  recolour() {
    const {scenario, colourBy, score, colourVersion} = get();
    if (!scenario) return;
    let range: ValueRange | null = null;
    // W2 slot: 'score' has no engine yet, so it is drawn as "no value"; W2 fills `score` and `excluded` here.
    if (colourBy === 'score') score.fill(NaN);
    else range = normaliseInto(scenario.cells[colourBy], score);
    set({range, colourVersion: colourVersion + 1});
  },

  bumpColours: () => set({colourVersion: get().colourVersion + 1}),
}));
