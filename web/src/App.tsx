import {useEffect, useState} from 'react';
import {parseManifest, type Manifest, type ScenarioIndexEntry} from './services/types';

const DATA_URL = `${import.meta.env.BASE_URL}data/`;

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(DATA_URL + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadFirstManifest(): Promise<Manifest> {
  const index = (await fetchJson('index.json')) as ScenarioIndexEntry[];
  if (!Array.isArray(index) || !index[0]?.manifest) throw new Error('index.json lists no scenario');
  return parseManifest(await fetchJson(index[0].manifest));
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadFirstManifest().then(setManifest, (e: unknown) => setError(String(e)));
  }, []);

  const nCells = manifest?.grids.reduce((sum, g) => sum + g.n_cells, 0);
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {manifest?.synthetic && (
        <p role="status" className="bg-amber-400 px-4 py-1 text-center font-semibold text-black">
          Synthetic data: placeholder values, not real lunar measurements
        </p>
      )}
      <div className="p-6">
        <h1 className="text-2xl font-bold">SELENE</h1>
        {error && <p role="alert" className="mt-4 text-red-400">Could not load scenario data: {error}</p>}
        {!error && !manifest && <p className="mt-4">Loading scenario…</p>}
        {manifest && (
          <dl className="mt-4 grid w-fit grid-cols-2 gap-x-6 gap-y-1">
            <dt className="text-slate-400">Scenario</dt>
            <dd data-testid="scenario-id">{manifest.scenario_id}</dd>
            <dt className="text-slate-400">Cells</dt>
            <dd data-testid="cell-count">{nCells?.toLocaleString('en-US')}</dd>
          </dl>
        )}
      </div>
    </main>
  );
}
