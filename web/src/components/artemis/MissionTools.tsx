// ARTEMIS mission tools (PLAN.md section 7.4): base-to-ice link and battery estimate for the selected cell.
import {latLngToCell} from 'h3-js';
import {useMemo, useState} from 'react';
import {KPI_ANCHORS} from '../../services/kpiConfig';
import type {Scenario} from '../../services/loader';
import {surfaceDistance_m} from '../../services/projection';
import {useStore} from '../../services/store';
import {steepestSlopeAlong} from './baseToIce';
import {batteryEstimate} from './battery';

function BaseToIce({scenario, row}: {scenario: Scenario; row: number}) {
  const kpis = useStore((s) => s.kpis);
  const focusCell = useStore((s) => s.focusCell);
  const {cells, grid} = scenario;
  const rowOf = useMemo(() => new Map(cells.h3.map((id, i) => [id, i])), [cells]);
  const ice = kpis ? kpis.nearestIce[row] : -1;
  const link = useMemo(() => {
    if (ice < 0 || ice === row) return null;
    const a = {lat_deg: cells.lat[row], lon_deg: cells.lon[row]};
    const b = {lat_deg: cells.lat[ice], lon_deg: cells.lon[ice]};
    return {
      distance_km: surfaceDistance_m(a.lat_deg, a.lon_deg, b.lat_deg, b.lon_deg) / 1000,
      slope: steepestSlopeAlong(a, b, (lat, lon) => rowOf.get(latLngToCell(lat, lon, grid.res)), cells.slope_mean_deg),
    };
  }, [ice, row, cells, grid.res, rowOf]);

  return (
    <section className="space-y-1" data-testid="base-to-ice">
      <h3 className="font-semibold">Base to ice</h3>
      {ice < 0 ? (
        <p className="text-slate-400" data-testid="no-ice">
          No ice-bearing cell in this scenario (none has an ice index of at least {KPI_ANCHORS.iceIndexMin}).
        </p>
      ) : ice === row ? (
        <p data-testid="self-ice">This cell bears ice itself (ice index of at least {KPI_ANCHORS.iceIndexMin}).</p>
      ) : (
        link && (
          <>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              <dt className="text-slate-400">Nearest ice-bearing cell</dt>
              <dd>
                <code>{cells.h3[ice]}</code>
              </dd>
              <dt className="text-slate-400">Surface distance (great circle)</dt>
              <dd data-testid="ice-distance">{link.distance_km.toFixed(1)} km</dd>
              <dt className="text-slate-400" title="Largest mean slope of the cells the straight line crosses">
                Steepest slope on the way
              </dt>
              <dd data-testid="ice-slope">
                {link.slope.maxSlope_deg === null ? 'not available' : `${link.slope.maxSlope_deg.toFixed(1)}°`}
              </dd>
            </dl>
            <p className="text-xs text-slate-500">
              Mean slope per cell along the straight line, {link.slope.cellsCrossed} cells in the scenario crossed. The line is
              drawn on the map.
            </p>
            <button
              type="button"
              data-testid="goto-ice"
              className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800"
              onClick={() => focusCell(ice)}
            >
              Go to the ice cell
            </button>
          </>
        )
      )}
    </section>
  );
}

function NumberField({label, value, onChange, step, testid}: {label: string; value: number; onChange: (v: number) => void; step: number; testid: string}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        data-testid={testid}
        className="w-24 rounded border border-slate-600 bg-slate-900 px-1 text-right"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={0}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
    </label>
  );
}

function Battery({scenario, row}: {scenario: Scenario; row: number}) {
  const [power_kW, setPower] = useState(1);
  const [energy_Wh_kg, setEnergy] = useState(200);
  const [dod, setDod] = useState(0.8);
  const cells = useStore((s) => s.cells) ?? scenario.cells; // custom-range columns when a range is active
  const t = cells.dark_max_h_best[row];
  const est = batteryEstimate(power_kW, t, energy_Wh_kg, dod);
  return (
    <section className="space-y-1" data-testid="battery">
      <h3 className="font-semibold">Battery for the longest night</h3>
      <p className="text-slate-400">
        Longest darkness at the best point: {t === null ? 'not available' : `${t.toFixed(1)} h`}
      </p>
      <NumberField label="Survival load P (kW)" value={power_kW} onChange={setPower} step={0.1} testid="battery-p" />
      <NumberField label="Specific energy e (Wh/kg)" value={energy_Wh_kg} onChange={setEnergy} step={10} testid="battery-e" />
      <NumberField label="Depth of discharge (0 to 1)" value={dod} onChange={setDod} step={0.05} testid="battery-dod" />
      {est ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4" data-testid="battery-result">
          <dt className="text-slate-400">Energy</dt>
          <dd data-testid="battery-kwh">{est.energy_kWh.toFixed(1)} kWh</dd>
          <dt className="text-slate-400">Battery mass</dt>
          <dd data-testid="battery-kg">{est.mass_kg.toFixed(0)} kg</dd>
        </dl>
      ) : (
        <p className="text-slate-400" data-testid="battery-none">
          {t === null ? 'No estimate: the darkness duration is not available for this cell.' : 'No estimate: check the inputs (P at least 0, e above 0, depth of discharge in (0, 1]).'}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Indicative first-order estimate, m = P t / (e DoD). Ignores cold derating, ageing and thermal control.
      </p>
    </section>
  );
}

export default function MissionTools({scenario}: {scenario: Scenario}) {
  const selected = useStore((s) => s.selected);
  if (selected === null) return <p className="text-slate-400">Click a cell on the map to use the mission tools.</p>;
  return (
    <div className="space-y-4">
      <BaseToIce scenario={scenario} row={selected} />
      <Battery scenario={scenario} row={selected} />
    </div>
  );
}
