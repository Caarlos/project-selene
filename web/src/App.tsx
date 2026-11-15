import {lazy, Suspense, useEffect, useState} from 'react';
import CellPanel from './components/astraea/CellPanel';
import ColourLegend from './components/astraea/ColourLegend';
import MapView from './components/astraea/MapView';
import {HardFilters, McdaWeights, TopCells} from './components/astraea/McdaControls';
import PresetButtons from './components/artemis/PresetButtons';
import {docHref} from './components/apollo/headings';
import {useStore} from './services/store';

const ApolloView = lazy(() => import('./components/apollo/ApolloView')); // Markdown + KaTeX stay out of the map bundle
const isDocHash = () => location.hash.startsWith('#doc=');

export default function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const scenario = useStore((s) => s.scenario);
  const load = useStore((s) => s.load);

  useEffect(() => {
    const dataUrl = new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI).href;
    void load(dataUrl, new URLSearchParams(location.search).get('scenario'));
  }, [load]);

  const [view, setView] = useState<'map' | 'docs'>(isDocHash() ? 'docs' : 'map');
  useEffect(() => {
    const on = () => isDocHash() && setView('docs');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const showMap = () => {
    history.replaceState(null, '', location.pathname + location.search);
    setView('map');
  };

  const manifest = scenario?.manifest;
  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {manifest?.synthetic && (
        <p role="status" className="bg-amber-400 px-4 py-1 text-center font-semibold text-black">
          Synthetic data: placeholder values, not real lunar measurements
        </p>
      )}
      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-slate-800 px-4 py-2">
        <h1 className="text-xl font-bold">SELENE</h1>
        {manifest && scenario && (
          <>
            <span>
              <span className="text-slate-400">Scenario </span>
              <span data-testid="scenario-id">{manifest.scenario_id}</span>
            </span>
            <span data-testid="date-range">
              <span className="text-slate-400">Dates (UTC) </span>
              {manifest.time.start.slice(0, 10)} to {manifest.time.end.slice(0, 10)} (end exclusive)
            </span>
            <span>
              <span className="text-slate-400">Cells </span>
              <span data-testid="cell-count">{scenario.grid.n_cells.toLocaleString('en-US')}</span>
            </span>
          </>
        )}
        <nav className="ml-auto flex gap-1" aria-label="View">
          {(['map', 'docs'] as const).map((v) => (
            <a
              key={v}
              data-testid={`view-${v}`}
              href={v === 'docs' ? docHref('primer') : '#'}
              aria-current={view === v ? 'page' : undefined}
              className={`rounded px-3 py-0.5 ${view === v ? 'bg-slate-700 font-semibold' : 'hover:bg-slate-800'}`}
              onClick={v === 'map' ? (e) => (e.preventDefault(), showMap()) : undefined}
            >
              {v === 'map' ? 'Map' : 'Documentation'}
            </a>
          ))}
        </nav>
      </header>
      {view === 'docs' && (
        <Suspense fallback={<p className="m-4">Loading documentation…</p>}>
          <ApolloView />
        </Suspense>
      )}
      {status === 'error' && (
        <p role="alert" className="m-4 rounded bg-red-950 p-4 text-red-200">
          Could not load scenario data: {error}
        </p>
      )}
      {status === 'loading' && <p className="m-4">Loading scenario…</p>}
      {status === 'ready' && scenario && (
        <div className={view === 'docs' ? 'hidden' : 'flex min-h-0 flex-1'}>
          <aside className="w-64 shrink-0 space-y-3 overflow-y-auto border-r border-slate-800 p-3">
            <PresetButtons />
            <McdaWeights />
            <HardFilters />
            <TopCells />
          </aside>
          <main className="relative min-w-0 flex-1">
            <MapView scenario={scenario} />
            <div className="absolute top-3 left-3">
              <ColourLegend />
            </div>
          </main>
          <aside className="w-96 shrink-0 overflow-y-auto border-l border-slate-800 p-3">
            <CellPanel scenario={scenario} />
          </aside>
        </div>
      )}
    </div>
  );
}
