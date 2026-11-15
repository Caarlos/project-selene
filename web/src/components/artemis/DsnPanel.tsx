// DSN ground segment panel (PLAN.md 5.4, D-09): Moon visibility from the three DSN stations over the active range,
// computed when the panel is first opened, in slices that yield to the page.
import {useEffect, useState} from 'react';
import {binFractions, combinedPct, computeDsn, earthVisibleSteps, STATIONS, type DsnResult} from '../../services/dsn';
import {clipRange} from '../../services/ephemeris';
import {loadEphemeris, loadHorizons, type Scenario} from '../../services/loader';
import {useStore} from '../../services/store';
import {cellPoint} from '../astraea/useCellSky';

/** Ranges longer than this many days are drawn as daily fractions. */
const HOURLY_DAYS = 60;

function Row({label, flags, perBin, pct}: {label: string; flags: Uint8Array; perBin: number; pct?: number}) {
  const f = binFractions(flags, perBin);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-slate-300">{label}</span>
      <svg viewBox={`0 0 ${f.length} 1`} preserveAspectRatio="none" className="h-4 flex-1 rounded bg-slate-800" role="img" aria-label={`${label} timeline`}>
        {Array.from(f, (v, i) => v > 0 && <rect key={i} x={i} y={0} width={1} height={1} fill="#38bdf8" opacity={v} />)}
      </svg>
      {pct !== undefined && <span className="w-12 text-right text-xs">{pct.toFixed(1)} %</span>}
    </div>
  );
}

export default function DsnPanel({scenario}: {scenario: Scenario}) {
  const [open, setOpen] = useState(false);
  const customRange = useStore((s) => s.customRange);
  const selected = useStore((s) => s.selected);
  const {t0, step_s, n} = scenario.manifest.ephemeris;
  const {time} = scenario.manifest;
  const range = customRange ?? clipRange(t0, step_s, n, time.start, time.end);
  const key = `${range.startIndex}-${range.endIndex}`;
  const [dsn, setDsn] = useState<{key: string; res: DsnResult} | null>(null);
  const [earth, setEarth] = useState<{key: string; row: number; flags: Uint8Array | null} | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void computeDsn(Date.parse(t0), step_s, range.startIndex, range.endIndex, () => cancelled).then(
      (res) => res && !cancelled && setDsn({key, res}),
    );
    return () => {
      cancelled = true;
    };
  }, [open, key, t0, step_s, range.startIndex, range.endIndex]);

  useEffect(() => {
    if (!open || selected === null) return;
    let cancelled = false;
    void Promise.all([loadHorizons(scenario), loadEphemeris(scenario)]).then(([h, eph]) => {
      if (cancelled) return;
      const hor = h.row_cdeg(selected);
      const p = cellPoint(scenario, selected);
      const flags = hor ? earthVisibleSteps(p.lat_deg, p.lon_deg, p.height_m, hor, eph.table, range.startIndex, range.endIndex) : null;
      setEarth({key, row: selected, flags});
    });
    return () => {
      cancelled = true;
    };
  }, [open, selected, key, scenario, range.startIndex, range.endIndex]);

  const res = dsn && dsn.key === key ? dsn.res : null;
  const cellEarth = earth && earth.key === key && earth.row === selected ? earth : null;
  const days = (range.endIndex - range.startIndex) * step_s / 86400;
  const perBin = days > HOURLY_DAYS ? Math.round(86400 / step_s) : 1;

  return (
    <details className="space-y-2" data-testid="dsn-panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">DSN ground segment</summary>
      <p className="text-xs text-slate-400">
        The Moon counts as usable when it is more than 10° above a station&apos;s horizon. This part is the same for every lunar
        site; only the &quot;cell sees Earth&quot; row depends on the selected cell.
      </p>
      {open && !res && <p className="text-xs text-slate-400">Computing…</p>}
      {res && (
        <div className="space-y-1" data-testid="dsn-result">
          {STATIONS.map((s, i) => (
            <div key={s.name} data-testid={`dsn-station-${s.name}`}>
              <Row label={s.name} flags={res.usable[i]} perBin={perBin} pct={res.stationPct[i]} />
              <span className="sr-only" data-testid={`dsn-pct-${s.name}`}>
                {res.stationPct[i].toFixed(1)} %
              </span>
              <span className="sr-only" data-testid={`dsn-windows-${s.name}`}>
                {res.windows[i].length}
              </span>
            </div>
          ))}
          {cellEarth?.flags && <Row label="Cell sees Earth" flags={cellEarth.flags} perBin={perBin} pct={undefined} />}
          <p className="text-xs" data-testid="dsn-any-pct">
            At least one station sees the Moon: {res.anyPct.toFixed(1)} % of the time.
          </p>
          {selected !== null && cellEarth?.flags && (
            <p className="text-xs" data-testid="dsn-combined-pct">
              Selected cell, Earth visible and a station tracking: {combinedPct(cellEarth.flags, res.any).toFixed(1)} %.
            </p>
          )}
          {selected !== null && cellEarth && !cellEarth.flags && (
            <p className="text-xs text-slate-400">This scenario has no horizon profile for the selected cell: no combined availability.</p>
          )}
          <p className="text-xs text-slate-500">
            {perBin > 1 ? 'Daily fractions (darker = less of the day). ' : 'One column per hour. '}
            Earth is treated as its centre; a station sits up to about 1° away from it as seen from the Moon.
          </p>
        </div>
      )}
    </details>
  );
}
