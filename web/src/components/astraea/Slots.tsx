// Named empty places in the layout for later tasks. Replace a <Slot> with the real component; keep the data-slot name.

export function Slot({name, task, title}: {name: string; task: string; title: string}) {
  return (
    <section data-slot={name} className="rounded border border-dashed border-slate-700 p-3 text-sm text-slate-500">
      {title} (task {task}, not built yet)
    </section>
  );
}

/** W2: MCDA weight sliders and presets. */
export const McdaWeightsSlot = () => <Slot name="mcda-weights" task="W2" title="Criteria weights" />;

/** W2: hard filters (min safe_frac, max slope_p95_deg, max dark_max_h_best, min earth_best_pct). */
export const HardFiltersSlot = () => <Slot name="hard-filters" task="W2" title="Hard filters" />;
