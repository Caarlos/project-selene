// "Colour by" dropdown and the legend of the map colours.
import {EXCLUDED_RGBA, NULL_RGBA, RAMP_CSS, type Rgba} from '../../services/colour';
import {COLOUR_METRICS, formatMetric, METRIC_INFO, type ColourField} from '../../services/metrics';
import {useStore} from '../../services/store';

const css = ([r, g, b, a]: Rgba) => `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;

export default function ColourLegend() {
  const colourBy = useStore((s) => s.colourBy);
  const range = useStore((s) => s.range);
  const setColourBy = useStore((s) => s.setColourBy);
  const unit = colourBy === 'score' ? '0–1' : METRIC_INFO[colourBy].unit;

  return (
    <div className="w-64 rounded bg-slate-900/90 p-3 text-sm shadow-lg">
      <label className="block">
        <span className="text-slate-400">Colour by</span>
        <select
          data-testid="colour-by"
          className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1"
          value={colourBy}
          onChange={(e) => setColourBy(e.target.value as ColourField)}
        >
          <option value="score">Score (0–1)</option>
          {COLOUR_METRICS.map((k) => (
            <option key={k} value={k}>
              {METRIC_INFO[k].label} ({METRIC_INFO[k].unit})
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 h-3 rounded" style={{background: `linear-gradient(to right, ${RAMP_CSS.join(', ')})`}} />
      <div className="mt-1 flex justify-between text-xs" data-testid="legend-range">
        {range ? (
          <>
            <span>{formatMetric(range.min, unit)}</span>
            <span>{formatMetric(range.max, unit)}</span>
          </>
        ) : (
          <span className="text-slate-400">
            {colourBy === 'score' ? 'Score not computed yet (MCDA engine, task W2)' : 'No value in this scenario'}
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-slate-300">
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 border border-slate-500" style={{background: css(NULL_RGBA)}} />
          No value
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 border border-slate-500" style={{background: css(EXCLUDED_RGBA)}} />
          Excluded by a filter
        </li>
      </ul>
    </div>
  );
}
