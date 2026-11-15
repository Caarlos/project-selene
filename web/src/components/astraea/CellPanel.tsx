// Right-hand panel: tabs for the cell inspector (W3), the ARTEMIS mission tools and the A/B comparator (W5).
import Compare from '../artemis/Compare';
import DateControl from '../artemis/DateControl';
import DsnPanel from '../artemis/DsnPanel';
import MissionTools from '../artemis/MissionTools';
import type {Scenario} from '../../services/loader';
import {PANEL_TABS as TABS, useStore} from '../../services/store';
import Inspector from './Inspector';

export default function CellPanel({scenario}: {scenario: Scenario}) {
  const tab = useStore((s) => s.panelTab);
  const setTab = useStore((s) => s.setPanelTab);
  const pinnedCount = useStore((s) => s.pinned.length);
  const custom = useStore((s) => s.customRange) !== null;
  return (
    <div className="space-y-3 text-sm" data-testid="cell-panel">
      <div role="tablist" className="flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            data-testid={`tab-${t.split(' ')[0].toLowerCase()}`}
            className={`rounded-t px-2 py-1 ${tab === t ? 'bg-slate-800 font-semibold' : 'text-slate-400 hover:text-slate-100'}`}
            onClick={() => setTab(t)}
          >
            {t === 'Compare' && pinnedCount > 0 ? `Compare (${pinnedCount})` : t === 'Dates' && custom ? 'Dates •' : t}
          </button>
        ))}
      </div>
      {tab === 'Inspector' && <Inspector scenario={scenario} />}
      {tab === 'Mission tools' && <MissionTools scenario={scenario} />}
      {tab === 'Compare' && <Compare scenario={scenario} />}
      {tab === 'Dates' && (
        <div className="space-y-4">
          <DateControl scenario={scenario} />
          <DsnPanel scenario={scenario} />
        </div>
      )}
    </div>
  );
}
