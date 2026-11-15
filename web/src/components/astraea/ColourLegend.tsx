// "Colour by" dropdown and the legend of the map colours.
import {EXCLUDED_RGBA, ICE_LINK_RGBA, NULL_RGBA, PINNED_RGBA, RAMP_CSS, SELECTED_RGBA, type Rgba} from '../../services/colour';
import {COLOUR_METRICS, formatMetric, METRIC_INFO, type ColourField} from '../../services/metrics';
import {useStore} from '../../services/store';

const css = ([r, g, b, a]: Rgba) => `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;

export default function ColourLegend() {
  const colourBy = useStore((s) => s.colourBy);
  const range = useStore((s) => s.range);
  const setColourBy = useStore((s) => s.setColourBy);
  const selected = useStore((s) => s.selected);
  const pinnedCount = useStore((s) => s.pinned.length);
  const hasIceLink = useStore((s) => s.selected !== null && (s.kpis?.nearestIce[s.selected] ?? -1) >= 0 && s.kpis?.nearestIce[s.selected] !== s.selected);
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
        {colourBy === 'score' ? (
          <>
            <span>0 (low)</span>
            <span>1 (high)</span>
          </>
        ) : range ? (
          <>
            <span>{formatMetric(range.min, unit)}</span>
            <span>{formatMetric(range.max, unit)}</span>
          </>
        ) : (
          <span className="text-slate-400">
            No value in this scenario
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
        {selected !== null && (
          <li className="flex items-center gap-2" data-testid="legend-selected">
            <span className="inline-block h-3 w-3 border-2" style={{borderColor: css(SELECTED_RGBA)}} />
            Selected cell
          </li>
        )}
        {pinnedCount > 0 && (
          <li className="flex items-center gap-2" data-testid="legend-pinned">
            <span className="inline-block h-3 w-3 border-2" style={{borderColor: css(PINNED_RGBA)}} />
            Pinned cell
          </li>
        )}
        {hasIceLink && (
          <li className="flex items-center gap-2" data-testid="legend-ice-link">
            <span className="inline-block h-0.5 w-3" style={{background: css(ICE_LINK_RGBA)}} />
            Link to the nearest ice-bearing cell
          </li>
        )}
      </ul>
    </div>
  );
}
