// Flat south-polar stereographic map (D-10): hillshade, cells, graticule, selection rings. Configuration proven in
// docs/verification/V2-rendering.md: cells are never stroked, and the click recogniser waits 5 s for slow picks.
import {COORDINATE_SYSTEM, OrthographicView, type PickingInfo} from '@deck.gl/core';
import {BitmapLayer, PathLayer, PolygonLayer, TextLayer} from '@deck.gl/layers';
import DeckGL, {type DeckGLRef} from '@deck.gl/react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {chooseDetail, DETAIL_FLY_ZOOM, hiddenRows, patchLabel} from '../../services/detail';
import {rangeMetrics} from '../../services/ephemeris';
import {ICE_LINK_RGBA, PINNED_RGBA, SELECTED_RGBA, writeCellColour, type Rgba} from '../../services/colour';
import type {Scenario} from '../../services/loader';
import {formatMetric, METRIC_INFO} from '../../services/metrics';
import {projectStereo_m} from '../../services/projection';
import {kpisFor, useStore} from '../../services/store';

const CARTESIAN = COORDINATE_SYSTEM.CARTESIAN;
const VIEW = new OrthographicView({flipY: false}); // +y up, as in the projection formula
const LAT_STEP_DEG = 2;
const LON_STEP_DEG = 30;
const MERIDIAN_LABELS: [number, string][] = [
  [0, '0°'],
  [90, '90°E'],
  [180, '180°'],
  [-90, '90°W'],
];

interface Graticule {
  paths: number[][];
  labels: {text: string; position: [number, number]}[];
}

/** Latitude circles every 2 deg and meridians every 30 deg, from the pole to the edge of the cap. */
function graticule(latMax_deg: number): Graticule {
  const paths: number[][] = [];
  for (let lat = -90 + LAT_STEP_DEG; lat <= latMax_deg; lat += LAT_STEP_DEG) {
    const ring: number[] = [];
    for (let lon = 0; lon <= 360; lon += 3) ring.push(...projectStereo_m(lat, lon));
    paths.push(ring);
  }
  for (let lon = -180; lon < 180; lon += LON_STEP_DEG) paths.push([0, 0, ...projectStereo_m(latMax_deg, lon)]);
  const labels = MERIDIAN_LABELS.map(([lon, text]) => ({text, position: projectStereo_m(latMax_deg + 0.7, lon)}));
  return {paths, labels};
}

/** Longest round length (1, 2 or 5 x 10^n km) that fits in `maxPx` pixels. */
function scaleBar(metresPerPx: number, maxPx = 140): {km: number; px: number} {
  const maxKm = (metresPerPx * maxPx) / 1000;
  const pow = 10 ** Math.floor(Math.log10(maxKm));
  const km = pow * ([5, 2, 1].find((m) => m * pow <= maxKm) ?? 1);
  return {km, px: (km * 1000) / metresPerPx};
}

function tooltip({object, layer}: PickingInfo) {
  if (layer?.id !== 'cells' || typeof object !== 'number') return null;
  const index = object; // the layer's data are row indexes (cells of the grid not shown are left out)
  const {scenario, cells, colourBy, score, excluded} = useStore.getState();
  if (!scenario || !cells) return null;
  const value =
    colourBy === 'score'
      ? `Score: ${formatMetric(score[index], '0–1')}`
      : `${METRIC_INFO[colourBy].label}: ${formatMetric(cells[colourBy][index], METRIC_INFO[colourBy].unit)}`;
  const lon = cells.lon[index];
  return {
    text:
      `${cells.h3[index]}\n${(-cells.lat[index]).toFixed(3)}°S, ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}\n` +
      value +
      (excluded[index] ? '\nExcluded by a filter' : ''),
  };
}

export default function MapView({scenario}: {scenario: Scenario}) {
  const selected = useStore((s) => s.selected);
  const pinned = useStore((s) => s.pinned);
  const colourVersion = useStore((s) => s.colourVersion);
  const select = useStore((s) => s.select);
  const focus = useStore((s) => s.focus);
  const nearestIce = useStore((s) => (s.selected === null ? undefined : kpisFor(s, s.selected)?.nearestIce));
  const detail = useStore((s) => s.detail);
  const detailError = useStore((s) => s.detailError);
  const showDetail = useStore((s) => s.showDetail);
  const deckRef = useRef<DeckGLRef>(null);
  const [fitZoom, setFitZoom] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fly, setFly] = useState<{target: [number, number]; zoom: number; focusSeq: number} | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const {manifest, polygons_m} = scenario;
  const bounds = manifest.hillshade.bounds_m;
  const grat = useMemo(() => graticule(manifest.region.lat_max), [manifest]);
  // A new `focus` replaces the initial view state, which makes deck.gl move the camera to the cell (same zoom, at least 1 in).
  const initialViewState = useMemo(() => {
    const fit = fitZoom ?? -10;
    if (fly && fly.focusSeq === (focus?.seq ?? 0)) { // a later `focus` makes the fly-to stale
      return {target: [...fly.target, 0] as [number, number, number], zoom: fly.zoom, minZoom: fit - 1, maxZoom: -3};
    }
    const c = focus ? projectStereo_m(scenario.cells.lat[focus.index], scenario.cells.lon[focus.index]) : [0, 0];
    const z = focus ? Math.min(-3, Math.max(zoom ?? fit, fit + 1)) : fit;
    return {target: [c[0], c[1], 0] as [number, number, number], zoom: z, minZoom: fit - 1, maxZoom: -3};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the camera moves only on a new focus, not on every zoom
  }, [fitZoom, focus, fly, scenario.manifest]);
  // Swap to a detail patch when zoomed in on it (also after the camera was moved by `focus`).
  useEffect(() => {
    const {zoom: z, target} = initialViewState;
    if (fitZoom !== null) void showDetail(chooseDetail(z, [target[0], target[1]], scenario.patches, useStore.getState().detail));
  }, [initialViewState, fitZoom, scenario.patches, showDetail]);
  // Rows drawn: all overview rows except those under the shown patch, plus the shown patch's rows.
  const shownRows = useMemo(() => {
    const hide = new Set(hiddenRows(scenario, detail));
    return Array.from({length: polygons_m.length}, (_, i) => i).filter((i) => !hide.has(i));
  }, [scenario, detail, polygons_m]);
  const outlines = useMemo(
    () =>
      scenario.patches.map((g) => {
        const [x0, y0, x1, y1] = g.bounds_m!;
        return {path: [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0], label: patchLabel(g), position: [(x0 + x1) / 2, y1] as [number, number]};
      }),
    [scenario.patches],
  );

  // Debug handle for the headless smoke test (web/tests/map-smoke.ts).
  useEffect(() => {
    Object.assign(window, {__selene: {store: useStore, rangeMetrics, deck: () => deckRef.current?.deck}});
  }, []);

  const {score, excluded} = useStore.getState();
  const rings = selected === null || pinned.includes(selected) ? pinned : [...pinned, selected];
  const ice = selected !== null && nearestIce ? nearestIce[selected] : -1;
  const iceLink =
    ice >= 0 && ice !== selected
      ? [[...projectStereo_m(scenario.cells.lat[selected!], scenario.cells.lon[selected!]), ...projectStereo_m(scenario.cells.lat[ice], scenario.cells.lon[ice])]]
      : [];
  const layers = [
    new BitmapLayer({id: 'hillshade', image: scenario.hillshadeUrl, bounds, coordinateSystem: CARTESIAN}),
    new PolygonLayer<number>({
      id: 'cells',
      data: shownRows,
      getPolygon: (i) => polygons_m[i],
      positionFormat: 'XY',
      coordinateSystem: CARTESIAN,
      filled: true,
      stroked: false, // outlines cost 8-19 s per frame in software rendering (V2-rendering)
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 90],
      getFillColor: (i, {target}) => writeCellColour(target, score[i], excluded[i]) as Rgba,
      updateTriggers: {getFillColor: colourVersion},
    }),
    new PathLayer<number[]>({
      id: 'graticule',
      data: grat.paths,
      getPath: (d) => d,
      positionFormat: 'XY',
      coordinateSystem: CARTESIAN,
      getColor: [255, 255, 255, 110],
      widthUnits: 'pixels',
      getWidth: 1,
    }),
    new TextLayer<Graticule['labels'][number]>({
      id: 'graticule-labels',
      data: grat.labels,
      getText: (d) => d.text,
      getPosition: (d) => d.position,
      coordinateSystem: CARTESIAN,
      getSize: 13,
      getColor: [226, 232, 240, 255],
    }),
    new PathLayer<(typeof outlines)[number]>({
      id: 'patch-outlines',
      data: outlines,
      getPath: (d) => d.path,
      positionFormat: 'XY',
      coordinateSystem: CARTESIAN,
      getColor: [250, 204, 21, 255],
      widthUnits: 'pixels',
      getWidth: 2,
    }),
    new TextLayer<(typeof outlines)[number]>({
      id: 'patch-labels',
      data: outlines,
      getText: (d) => d.label,
      getPosition: (d) => d.position,
      coordinateSystem: CARTESIAN,
      getSize: 12,
      getColor: [250, 204, 21, 255],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
    }),
    new PolygonLayer<number>({
      id: 'rings',
      data: rings,
      getPolygon: (i) => polygons_m[i],
      positionFormat: 'XY',
      coordinateSystem: CARTESIAN,
      filled: false,
      stroked: true,
      getLineColor: (i) => (i === selected ? SELECTED_RGBA : PINNED_RGBA),
      lineWidthUnits: 'pixels',
      getLineWidth: 3,
      updateTriggers: {getLineColor: selected},
    }),
    new PathLayer<number[]>({
      id: 'ice-link',
      data: iceLink,
      getPath: (d) => d,
      positionFormat: 'XY',
      coordinateSystem: CARTESIAN,
      getColor: ICE_LINK_RGBA,
      widthUnits: 'pixels',
      getWidth: 3,
    }),
  ];

  const shown = scenario.grids.find((g) => g.grid.id === detail)?.grid ?? scenario.grid;
  const gridNote = detailError
    ? `Detail patch could not be loaded: ${detailError}`
    : `${detail ? `Detail: ${patchLabel(shown)}` : 'Overview'}, resolution ${shown.res}, ${shown.n_cells.toLocaleString('en-US')} cells` +
      (detail ? '' : scenario.patches.length ? '. Zoom into a yellow outline for finer hexagons.' : '');
  const bar = zoom === null ? null : scaleBar(2 ** -zoom);
  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900" data-testid="map">
      <DeckGL
        ref={deckRef}
        views={VIEW}
        controller
        initialViewState={initialViewState}
        layers={layers}
        getTooltip={tooltip}
        // picking can take over 250 ms on slow machines; the default tap limit would drop the click (V2-rendering)
        eventRecognizerOptions={{click: {time: 5000}}}
        onClick={(info) => select(info.layer?.id === 'cells' && typeof info.object === 'number' ? info.object : null)}
        onResize={({width, height}) => {
          if (fitZoom !== null || width <= 0 || height <= 0) return;
          const half_m = Math.max(...bounds.map(Math.abs));
          const z = Math.log2(Math.min(width, height) / (2.3 * half_m)); // 2.3: room for the meridian labels
          setFitZoom(z);
          setZoom(z);
        }}
        onViewStateChange={({viewState}) => {
          if (typeof viewState.zoom === 'number') {
            setZoom(viewState.zoom);
            const t = (viewState as {target: number[]}).target;
            void showDetail(chooseDetail(viewState.zoom, [t[0], t[1]], scenario.patches, useStore.getState().detail));
          }
        }}
        onError={(e) => setRenderError(e.message)}
      />
      {bar && (
        <div
          className="pointer-events-none absolute bottom-3 left-3 text-xs text-slate-100"
          data-testid="scale-bar"
          title="Stereographic scale: exact at the pole, about 0.8 % longer at 80°S"
        >
          <div className="border-x border-b border-slate-100 pb-1 text-center" style={{width: bar.px}}>
            {bar.km} km
          </div>
        </div>
      )}
      <div className="absolute top-3 right-3 flex items-center gap-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-100">
        <span data-testid="grid-note">{gridNote}</span>
        {scenario.patches.length > 0 && fitZoom !== null && (
          <button
            type="button"
            data-testid="detail-fly"
            className="rounded bg-slate-700 px-2 py-0.5 hover:bg-slate-600"
            onClick={() => {
              const b = scenario.patches[0].bounds_m!;
              const target: [number, number] = detail ? [0, 0] : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
              setFly({target, zoom: detail ? fitZoom : DETAIL_FLY_ZOOM, focusSeq: focus?.seq ?? 0});
            }}
          >
            {detail ? 'Back to overview' : 'Zoom to detail'}
          </button>
        )}
      </div>
      {renderError && (
        <p role="alert" className="absolute inset-x-3 top-3 rounded bg-red-900/90 px-3 py-2 text-sm text-red-100">
          Map rendering problem: {renderError}
        </p>
      )}
    </div>
  );
}
