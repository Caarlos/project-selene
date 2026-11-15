// Mission preset buttons (PLAN.md section 7.4).
import {useStore} from '../../services/store';
import {MISSION_PRESETS} from './presets';

export default function PresetButtons() {
  const applyPreset = useStore((s) => s.applyPreset);
  return (
    <section data-testid="presets" className="space-y-1 text-sm">
      <h2 className="text-base font-semibold">Mission presets</h2>
      {MISSION_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`preset-${p.id}`}
          className="block w-full rounded border border-slate-600 px-2 py-1 text-left hover:bg-slate-800"
          onClick={() => applyPreset(p.id)}
        >
          {p.label}
        </button>
      ))}
      <p className="text-xs text-slate-400">
        Preset values are this project&apos;s own assumptions, not NASA requirements.
      </p>
    </section>
  );
}
