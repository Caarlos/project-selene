// Headless check of the map on the fixture scenario. Not part of `pnpm test`. Run from web/ with Node 24:
//   node tests/map-smoke.ts
// Builds, serves the build on 127.0.0.1:4173, drives Chromium with software WebGL (SwiftShader), writes
// test-results/map-smoke.png and prints a JSON report. Frames take about 0.5 s here: only JS timings are asserted.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {cellToLatLng, getResolution, latLngToCell} from 'h3-js';
import {chromium, type Page} from 'playwright';
import {projectStereo_m} from '../src/services/projection.ts';

const WEB = new URL('..', import.meta.url).pathname;
const URL_BASE = 'http://127.0.0.1:4173/';
const VITE = ['node_modules/vite/bin/vite.js'];
const RECOLOUR_BUDGET_MS = 100; // PLAN.md section 7.1

// Everything inside page.evaluate runs in the browser against the debug handle set by MapView.
declare const window: {__selene: any}; // eslint-disable-line @typescript-eslint/no-explicit-any

execFileSync(process.execPath, [...VITE, 'build'], {cwd: WEB, stdio: 'inherit'});
const preview = spawn(process.execPath, [...VITE, 'preview'], {cwd: WEB, stdio: 'ignore'});
const report: Record<string, unknown> = {};
const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']});
try {
  for (let i = 0; ; i++) {
    if (await fetch(URL_BASE).then((r) => r.ok, () => false)) break;
    assert(i < 50, 'preview server did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const ready = (p: Page) =>
    p.waitForFunction(
      () => {
        const deck = window.__selene?.deck();
        const layers = deck?.layerManager?.getLayers() ?? [];
        return layers.length > 0 && layers.every((l: {isLoaded: boolean}) => l.isLoaded);
      },
      null,
      {timeout: 60_000},
    );
  // Draws a frame and reads it back in the same task (the buffer is cleared after compositing).
  const frame = () =>
    page.evaluate(() => {
      const deck = window.__selene.deck();
      const gl: WebGL2RenderingContext = deck.device.gl;
      const t0 = performance.now();
      deck.redraw('smoke');
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const frameMs = performance.now() - t0;
      const colours = new Set<number>();
      let opaque = 0;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) {
        colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        if (px[i + 3] > 0) opaque++;
        sum = (sum * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0;
      }
      return {frameMs, distinctColours: colours.size, drawnFraction: opaque / (w * h), checksum: sum};
    });

  // 1. loads the fixture
  await page.goto(`${URL_BASE}?scenario=fixture`);
  await ready(page);
  await page.waitForTimeout(1500);
  assert.equal(await page.textContent('[data-testid=scenario-id]'), 'fixture');
  assert.equal(await page.textContent('[data-testid=cell-count]'), '14,444');
  assert.match((await page.textContent('[role=status]'))!, /Synthetic data/);
  assert.match((await page.textContent('[data-testid=date-range]'))!, /2027-01-01 to 2028-01-01/);

  // 2. canvas is non-blank
  const first = await frame();
  report.firstFrame = first;
  assert(first.distinctColours > 100, `canvas looks blank: ${first.distinctColours} colours`);
  assert(first.drawnFraction > 0.3, `only ${first.drawnFraction} of the canvas is drawn`);
  mkdirSync(`${WEB}test-results`, {recursive: true});
  await page.screenshot({path: `${WEB}test-results/map-smoke.png`});

  // 3. hover and click a known cell centre
  const id = latLngToCell(-85, 45, 5);
  const [lat, lon] = cellToLatLng(id);
  assert.equal(latLngToCell(lat, lon, 5), id);
  const [sx, sy] = await page.evaluate(
    (xy) => window.__selene.deck().getViewports()[0].project(xy) as [number, number],
    projectStereo_m(lat, lon),
  );
  const box = (await page.locator('[data-testid=map] canvas').boundingBox())!;
  await page.mouse.move(box.x + sx + 1, box.y + sy + 1);
  await page.mouse.move(box.x + sx, box.y + sy);
  await page.waitForFunction((id) => document.querySelector('.deck-tooltip')?.textContent?.includes(id), id, {timeout: 10_000});
  report.tooltip = await page.textContent('.deck-tooltip');
  await page.mouse.click(box.x + sx, box.y + sy);
  await page.waitForSelector('[data-testid=selected-cell-id]', {timeout: 10_000});
  assert.equal(await page.textContent('[data-testid=selected-cell-id]'), id);
  report.clicked = {expected: id, lat, lon, screen: [sx, sy]};
  await page.waitForTimeout(800);
  await page.screenshot({path: `${WEB}test-results/map-smoke-selected.png`});

  // 4. colour-by through the real dropdown
  const before = await frame();
  await page.selectOption('[data-testid=colour-by]', 'slope_p95_deg');
  await page.waitForTimeout(800);
  const after = await frame();
  assert.notEqual(after.checksum, before.checksum, 'colours did not change');
  report.legendAfterChange = await page.textContent('[data-testid=legend-range]');

  // 5. JS time of the recolour path: fill score -> React commit -> deck attribute update (no frame)
  const timings = await page.evaluate(async () => {
    const {store, deck} = window.__selene;
    const out: {field: string; scoreMs: number; commitMs: number; updateLayersMs: number; totalMs: number}[] = [];
    for (const field of ['sun_best_pct', 'ice_index', 'elev_m', 'score', 'tmax_k', 'safe_frac']) {
      const t0 = performance.now();
      store.getState().setColourBy(field);
      const t1 = performance.now();
      const version = store.getState().colourVersion;
      const committed = () =>
        deck().props.layers.find((l: {id: string}) => l.id === 'cells').props.updateTriggers.getFillColor === version;
      for (let i = 0; !committed(); i++) {
        if (i > 200) throw new Error('React did not hand the new colours to deck.gl');
        await new Promise<void>((r) => queueMicrotask(r));
      }
      const t2 = performance.now();
      deck().layerManager.updateLayers();
      const t3 = performance.now();
      out.push({field, scoreMs: t1 - t0, commitMs: t2 - t1, updateLayersMs: t3 - t2, totalMs: t3 - t0});
      await new Promise((r) => setTimeout(r, 700)); // let the slow frame finish before the next sample
    }
    return out;
  });
  report.recolour = timings.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(1) : v])));
  for (const t of timings) assert(t.totalMs < RECOLOUR_BUDGET_MS, `recolour ${t.field}: ${t.totalMs} ms`);
  report.frameAfterRecolour = await frame();

  // 6. MCDA: the real slider and a preset button change the colours; JS time of slider ticks and preset clicks
  await page.evaluate(() => window.__selene.store.getState().setColourBy('score'));
  await page.waitForTimeout(800);
  const s0 = await frame();
  await page.locator('[data-testid=slider-ice]').fill('90');
  await page.waitForTimeout(800);
  const s1 = await frame();
  assert.notEqual(s1.checksum, s0.checksum, 'slider did not change the colours');
  report.shareIceAfterSlider = await page.textContent('[data-testid=share-ice]');
  await page.click('[data-testid=preset-artemis3]');
  await page.waitForTimeout(800);
  const s2 = await frame();
  assert.notEqual(s2.checksum, s1.checksum, 'preset did not change the colours');
  assert.match((await page.textContent('[data-testid=excluded-count]'))!, /^[1-9][\d,]* cells excluded/);
  assert.equal(await page.locator('[data-testid=filter-on-slope_p95_deg]').isChecked(), true);
  assert.equal(await page.locator('[data-testid=filter-limit-slope_p95_deg]').inputValue(), '10');
  assert.equal(await page.locator('[data-testid=slider-sun]').inputValue(), '30');
  report.artemis3 = {excluded: await page.textContent('[data-testid=excluded-count]'), shareSun: await page.textContent('[data-testid=share-sun]')};
  await page.waitForSelector('[data-testid=top-cells] li');
  const topId = await page.textContent('[data-testid=top-cells] li:first-child code');
  await page.click('[data-testid=top-cells] li:first-child button');
  await page.waitForTimeout(800);
  assert.equal(await page.textContent('[data-testid=selected-cell-id]'), topId);
  assert.match((await page.textContent('[data-testid=cell-score-value]'))!, /^0\.\d\d/);
  await page.screenshot({path: `${WEB}test-results/map-smoke-mcda.png`});
  const mcda = await page.evaluate(async () => {
    const {store, deck} = window.__selene;
    const run = async (act: () => void) => {
      const t0 = performance.now();
      act();
      const version = store.getState().colourVersion;
      const committed = () =>
        deck().props.layers.find((l: {id: string}) => l.id === 'cells').props.updateTriggers.getFillColor === version;
      for (let i = 0; !committed(); i++) {
        if (i > 200) throw new Error('React did not hand the new colours to deck.gl');
        await new Promise<void>((r) => queueMicrotask(r));
      }
      deck().layerManager.updateLayers();
      return performance.now() - t0;
    };
    const slider: number[] = [];
    for (let i = 0; i < 10; i++) {
      slider.push(await run(() => store.getState().setWeight(['sun', 'comms', 'terrain', 'ice'][i % 4], 10 + 7 * i)));
      await new Promise((r) => setTimeout(r, 700));
    }
    const preset: number[] = [];
    for (const id of ['clps', 'basecamp', 'artemis3']) {
      preset.push(await run(() => store.getState().applyPreset(id)));
      await new Promise((r) => setTimeout(r, 700));
    }
    return {sliderTickMs: slider, presetMs: preset};
  });
  report.mcdaTimings = mcda;
  for (const t of [...mcda.sliderTickMs, ...mcda.presetMs]) assert(t < RECOLOUR_BUDGET_MS, `MCDA update ${t} ms`);

  // 7. inspector (W3) and ARTEMIS tools (W5) at 1366x768
  await page.setViewportSize({width: 1366, height: 768});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__selene.store.getState().select(10));
  await page.waitForSelector('[data-testid=horizon-chart] canvas', {timeout: 30_000});
  await page.waitForTimeout(500);
  const sky: Record<string, number> = {};
  for (const id of ['sun', 'earth', 'dark', 'outage']) {
    const text = (await page.textContent(`[data-testid=recomputed-${id}]`))!;
    sky[id] = parseFloat(text);
    assert(Number.isFinite(sky[id]), `recomputed ${id} is "${text}"`);
  }
  assert(sky.sun >= 0 && sky.sun <= 100 && sky.earth >= 0 && sky.earth <= 100);
  report.recomputed = {...sky, storedSun: await page.textContent('[data-testid=stored-sun]')};
  const chartBox = (await page.locator('[data-testid=horizon-chart] canvas').boundingBox())!;
  assert(chartBox.width > 200 && chartBox.height > 100, 'chart canvas has no size');
  assert.match((await page.textContent('[data-testid=synthetic-note]'))!, /Synthetic scenario/);
  assert.match((await page.textContent('[data-testid=group-HESTIA]'))!, /Ice stability index/);
  await page.screenshot({path: `${WEB}test-results/map-smoke-inspector.png`});
  await page.evaluate(() => window.__selene.store.getState().select(5000));
  await page.waitForSelector('[data-testid=no-horizon]', {timeout: 10_000});
  assert.equal(await page.locator('[data-testid=horizon-chart]').count(), 0);

  // JS time of the four date-dependent metrics for one cell over one year of hourly steps (in the browser)
  report.rangeMetricsMsPerCellYear = await page.evaluate(() => {
    const {rangeMetrics} = window.__selene;
    const table = new Float32Array(8760 * 5);
    for (let k = 0; k < 8760; k++) table.set([((k * 0.55) % 360) - 180, 1.5 * Math.sin(k / 1400), ((k * 0.03) % 360) - 180, 6 * Math.sin(k / 650), 384_400], k * 5);
    const horizon = new Int16Array(360).fill(150);
    const out = new Float64Array(4);
    for (let i = 0; i < 20; i++) rangeMetrics(-89.5, 20, 1000, horizon, table, 0, 8760, 3600, out);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) rangeMetrics(-89.5, 20, 1000, horizon, table, 0, 8760, 3600, out);
    return +((performance.now() - t0) / 200).toFixed(3);
  });

  // mission tools: base to ice, battery
  await page.evaluate(() => window.__selene.store.getState().select(10));
  await page.click('[data-testid=tab-mission]');
  const iceCell = await page.evaluate(() => window.__selene.store.getState().kpis.nearestIce[10]);
  if (iceCell >= 0 && iceCell !== 10) {
    assert.match((await page.textContent('[data-testid=ice-distance]'))!, /^\d+\.\d km$/);
    report.baseToIce = {distance: await page.textContent('[data-testid=ice-distance]'), slope: await page.textContent('[data-testid=ice-slope]')};
    await page.click('[data-testid=goto-ice]');
    await page.waitForTimeout(500);
    assert.notEqual(await page.evaluate(() => window.__selene.store.getState().selected), 10);
    await page.evaluate(() => window.__selene.store.getState().select(10));
  }
  report.battery = await page.textContent('[data-testid=battery]');
  await page.screenshot({path: `${WEB}test-results/map-smoke-tools.png`});

  // comparator: pin two cells, two columns
  await page.click('[data-testid=tab-inspector]');
  await page.click('[data-testid=pin-button]');
  await page.evaluate(() => window.__selene.store.getState().select(20));
  await page.click('[data-testid=pin-button]');
  await page.click('[data-testid=tab-compare]');
  assert.equal(await page.locator('[data-testid=compare-col]').count(), 2);
  assert(await page.locator('[data-best=true]').count() > 0, 'no best value highlighted');
  await page.waitForTimeout(800);
  await page.screenshot({path: `${WEB}test-results/map-smoke-compare.png`});
  await page.click('[data-testid=unpin] >> nth=0');
  assert.equal(await page.locator('[data-testid=compare-col]').count(), 1);

  // 7b. custom dates (W4): month and year ranges in workers, progress, note, Baseline restores, DSN panel
  await page.evaluate(() => window.__selene.store.getState().resetMcda());
  await page.evaluate(() => window.__selene.store.getState().select(10));
  await page.click('[data-testid=tab-dates]');
  await page.waitForTimeout(500);
  const checksum = () =>
    page.evaluate(() => {
      const s: Float32Array = window.__selene.store.getState().mcdaScore;
      let h = 0;
      for (let i = 0; i < s.length; i++) if (s[i] === s[i]) h = (h * 31 + Math.round(s[i] * 1e6)) | 0; // NaN: hidden rows
      return h;
    });
  const applyRange = async (start: string, end: string) => {
    await page.evaluate(() => {
      const w = window as unknown as {__progress: number[]};
      w.__progress = [];
      window.__selene.store.subscribe((s: {customStatus: {phase: string; progress: number}}) => {
        if (s.customStatus.phase === 'computing') w.__progress.push(s.customStatus.progress);
      });
    });
    await page.fill('[data-testid=date-start]', start);
    await page.fill('[data-testid=date-end]', end);
    const t0 = Date.now();
    await page.click('[data-testid=date-apply]');
    await page.waitForSelector('[data-testid=date-note]', {timeout: 300_000});
    const wall_ms = Date.now() - t0;
    const progress = await page.evaluate(() => (window as unknown as {__progress: number[]}).__progress);
    return {wall_ms, maxProgress: Math.max(...progress), ticks: progress.length};
  };
  const baseSum = await checksum();
  const month = await applyRange('2027-03-01', '2027-03-30');
  assert.equal(month.maxProgress, 1, 'progress did not reach 100%');
  assert.notEqual(await checksum(), baseSum, 'scores did not change for the custom range');
  const note = (await page.textContent('[data-testid=date-note]'))!;
  assert.match(note, /best-point horizon/);
  assert.match(note, /pipeline\.selene_build --start-date/);
  assert.match((await page.textContent('[data-testid=date-missing]'))!, /11444 of 14444 cells have no horizon/);
  assert.match((await page.textContent('[data-testid=date-active]'))!, /2027-03-01 to 2027-03-30/);
  await page.screenshot({path: `${WEB}test-results/map-smoke-dates.png`});
  // inspector follows the range: the recomputed value equals the (override) metric of the same cell
  await page.click('[data-testid=tab-inspector]');
  await page.waitForSelector('[data-testid=horizon-chart] canvas', {timeout: 30_000});
  await page.waitForTimeout(500);
  assert.equal(parseFloat((await page.textContent('[data-testid=recomputed-sun]'))!), parseFloat((await page.textContent('[data-testid=metric-sun_best_pct]'))!));
  assert.match((await page.textContent('[data-testid=group-EOS]'))!, /baseline only/);
  await page.screenshot({path: `${WEB}test-results/map-smoke-dates-inspector.png`});
  await page.click('[data-testid=tab-dates]');
  // DSN panel: three station percentages
  await page.click('[data-testid=dsn-panel] summary');
  await page.waitForSelector('[data-testid=dsn-result]', {timeout: 60_000});
  const dsnPct: Record<string, string> = {};
  for (const s of ['Madrid', 'Goldstone', 'Canberra']) {
    dsnPct[s] = (await page.textContent(`[data-testid=dsn-pct-${s}]`))!;
    assert.match(dsnPct[s], /^\d+\.\d %$/);
  }
  await page.waitForSelector('[data-testid=dsn-combined-pct]', {timeout: 30_000});
  report.dsn = {...dsnPct, any: await page.textContent('[data-testid=dsn-any-pct]'), combined: await page.textContent('[data-testid=dsn-combined-pct]')};
  await page.screenshot({path: `${WEB}test-results/map-smoke-dsn.png`});
  // Baseline restores the original scores instantly
  await page.click('[data-testid=date-baseline]');
  assert.equal(await checksum(), baseSum, 'Baseline did not restore the scores');
  assert.equal(await page.locator('[data-testid=date-note]').count(), 0);
  // cancel: a one-year range stopped right away leaves the baseline untouched
  await page.fill('[data-testid=date-start]', '2027-01-01');
  await page.fill('[data-testid=date-end]', '2027-12-31');
  await page.click('[data-testid=date-apply]');
  await page.waitForSelector('[data-testid=date-cancel]');
  await page.click('[data-testid=date-cancel]');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-testid=date-progress]').count(), 0);
  assert.equal(await page.evaluate(() => window.__selene.store.getState().customRange), null);
  assert.equal(await checksum(), baseSum);
  const year = await applyRange('2027-01-01', '2027-12-31');
  assert.equal(year.maxProgress, 1);
  await page.click('[data-testid=date-baseline]');
  assert.equal(await checksum(), baseSum);
  report.customDates = {
    cores: await page.evaluate(() => navigator.hardwareConcurrency),
    month_ms: month.wall_ms,
    year_ms: year.wall_ms,
    extrapolated_14444_cells_year_s: +((year.wall_ms / 3000) * 14444 / 1000).toFixed(1),
    progressTicks: {month: month.ticks, year: year.ticks},
  };

  // 7c. main flow on the default real scenario (W7 documentation, W8 dates and reference values)
  await page.goto(URL_BASE);
  await ready(page);
  await page.waitForTimeout(1500);
  assert.equal(await page.textContent('[data-testid=scenario-id]'), 'south-pole-2027');
  assert.equal(await page.textContent('[data-testid=cell-count]'), '14,444');
  assert.equal(await page.locator('[role=status]').count(), 0, 'real scenario is labelled synthetic');
  const realId = latLngToCell(-85, 45, 5);
  const [rlat, rlon] = cellToLatLng(realId);
  const [rx, ry] = await page.evaluate((xy) => window.__selene.deck().getViewports()[0].project(xy) as [number, number], projectStereo_m(rlat, rlon));
  const rbox = (await page.locator('[data-testid=map] canvas').boundingBox())!;
  await page.mouse.move(rbox.x + rx, rbox.y + ry);
  await page.mouse.click(rbox.x + rx, rbox.y + ry);
  await page.waitForSelector('[data-testid=selected-cell-id]', {timeout: 10_000});
  assert.equal(await page.textContent('[data-testid=selected-cell-id]'), realId);
  assert((await page.textContent('[data-testid=sun-summary]'))!.length > 20, 'sun summary is empty');
  // the legend link entry needs a cell with a distinct ice-bearing cell: take one from the KPIs
  await page.evaluate(() => {
    const {store} = window.__selene;
    const {nearestIce} = store.getState().kpis;
    store.getState().select(nearestIce.findIndex((n: number, i: number) => n >= 0 && n !== i));
  });
  await page.waitForSelector('[data-testid=legend-ice-link]', {timeout: 10_000});
  assert.equal(await page.locator('[data-testid=legend-selected]').count(), 1);
  await page.waitForTimeout(800);
  await page.screenshot({path: `${WEB}test-results/real-selected.png`});

  // 7c-2. detail patch (W6): zoom into the Shackleton patch, the resolution-7 cells replace the overview there
  const centre = await page.evaluate(() => {
    const {scenario} = window.__selene.store.getState();
    const [x0, y0, x1, y1] = scenario.patches[0].bounds_m;
    return {xy: [(x0 + x1) / 2, (y0 + y1) / 2], cells: scenario.cells, n0: scenario.grid.n_cells};
  });
  assert.match((await page.textContent('[data-testid=grid-note]'))!, /^Overview, resolution 5, 14,444 cells/);
  let nearest = 0;
  let nearestD = Infinity;
  for (let i = 0; i < centre.n0; i++) {
    const [x, y] = projectStereo_m(centre.cells.lat[i], centre.cells.lon[i]);
    const d = Math.hypot(x - centre.xy[0], y - centre.xy[1]);
    if (d < nearestD) [nearest, nearestD] = [i, d];
  }
  await page.evaluate((i) => window.__selene.store.getState().focusCell(i), nearest);
  await page.mouse.move(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
  for (let i = 0; i < 25 && (await page.evaluate(() => window.__selene.store.getState().detail)) === null; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(600);
  }
  await page.waitForFunction(() => window.__selene.store.getState().detail === 'shackleton_ridge', null, {timeout: 60_000});
  await ready(page);
  assert.equal(await page.textContent('[data-testid=grid-note]'), 'Detail: Shackleton ridge, resolution 7, 6,024 cells');
  const drawn = await page.evaluate(() => {
    const layer = window.__selene.deck().layerManager.getLayers().find((l: {id: string}) => l.id === 'cells');
    const {scenario} = window.__selene.store.getState();
    const n0 = scenario.grid.n_cells;
    const rows: number[] = layer.props.data;
    return {total: rows.length, patchRows: rows.filter((r) => r >= n0).length, covered: scenario.grids[1].covered.length, n0};
  });
  assert.equal(drawn.patchRows, 6024);
  assert.equal(drawn.total, drawn.n0 - drawn.covered + 6024, 'overview cells under the patch are still drawn');
  // click the patch cell nearest the view centre
  const target = await page.evaluate(() => {
    const deck = window.__selene.deck();
    const vp = deck.getViewports()[0];
    const c = vp.unproject([vp.width / 2, vp.height / 2]) as number[];
    const {cells, grids} = window.__selene.store.getState().scenario;
    return {c, lat: cells.lat.slice(grids[1].rowStart), lon: cells.lon.slice(grids[1].rowStart), h3: cells.h3.slice(grids[1].rowStart)};
  });
  let k = 0;
  let kd = Infinity;
  target.lat.forEach((lat: number, i: number) => {
    const [x, y] = projectStereo_m(lat, target.lon[i]);
    const d = Math.hypot(x - target.c[0], y - target.c[1]);
    if (d < kd) [k, kd] = [i, d];
  });
  const [px, py] = await page.evaluate((xy) => window.__selene.deck().getViewports()[0].project(xy) as [number, number], projectStereo_m(target.lat[k], target.lon[k]));
  await page.mouse.move(rbox.x + px + 1, rbox.y + py + 1);
  await page.mouse.move(rbox.x + px, rbox.y + py);
  await page.mouse.click(rbox.x + px, rbox.y + py);
  await page.waitForFunction(() => {
    const {selected, scenario} = window.__selene.store.getState();
    return selected !== null && selected >= scenario.grid.n_cells;
  }, null, {timeout: 30_000});
  const patchId = (await page.textContent('[data-testid=selected-cell-id]'))!;
  assert.equal(getResolution(patchId), 7, `selected ${patchId} is not a resolution-7 cell`);
  assert.equal(patchId, target.h3[k]);
  await page.waitForSelector('[data-testid=horizon-chart] canvas', {timeout: 30_000});
  assert((await page.textContent('[data-testid=sun-summary]'))!.length > 20, 'sun summary is empty for the patch cell');
  await page.waitForTimeout(800);
  await page.screenshot({path: `${WEB}test-results/real-patch.png`});
  // slider recolour budget with the patch shown
  const patchTimings = await page.evaluate(async () => {
    const {store, deck} = window.__selene;
    const out: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      store.getState().setWeight(['sun', 'comms', 'terrain', 'ice'][i % 4], 10 + 13 * i);
      const version = store.getState().colourVersion;
      const committed = () => deck().props.layers.find((l: {id: string}) => l.id === 'cells').props.updateTriggers.getFillColor === version;
      for (let j = 0; !committed(); j++) {
        if (j > 200) throw new Error('React did not hand the new colours to deck.gl');
        await new Promise<void>((r) => queueMicrotask(r));
      }
      deck().layerManager.updateLayers();
      out.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 700));
    }
    store.getState().resetMcda();
    return out;
  });
  report.patchSliderTickMs = patchTimings.map((t) => +t.toFixed(1));
  for (const t of patchTimings) assert(t < RECOLOUR_BUDGET_MS, `slider tick with the patch shown: ${t} ms`);
  // zoom back out: the overview returns
  for (let i = 0; i < 25 && (await page.evaluate(() => window.__selene.store.getState().detail)) !== null; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(600);
  }
  await page.waitForFunction(() => window.__selene.store.getState().detail === null, null, {timeout: 60_000});
  assert.match((await page.textContent('[data-testid=grid-note]'))!, /^Overview, resolution 5, 14,444 cells/);
  report.patch = {clicked: patchId, drawn};
  // reference value and basis change the scores
  await page.evaluate(() => window.__selene.store.getState().setColourBy('score'));
  const real0 = await checksum();
  await page.fill('[data-testid=ref-iceDistanceScale_km]', '5');
  await page.waitForTimeout(500);
  const real1 = await checksum();
  assert.notEqual(real1, real0, 'reference value did not change the scores');
  await page.selectOption('[data-testid=basis-select]', 'mean');
  await page.waitForTimeout(500);
  assert.notEqual(await checksum(), real1, 'basis did not change the scores');
  await page.click('[data-testid=ref-reset]');
  await page.waitForTimeout(500);
  assert.equal(await checksum(), real0, 'reset did not restore the scores');
  // header date button opens the Dates tab; polar-winter preset runs with progress and marks the header custom
  await page.click('[data-testid=date-range]');
  await page.waitForSelector('[data-testid=date-control]');
  await page.evaluate(() => {
    const w = window as unknown as {__progress: number[]};
    w.__progress = [];
    window.__selene.store.subscribe((s: {customStatus: {phase: string; progress: number}}) => {
      if (s.customStatus.phase === 'computing') w.__progress.push(s.customStatus.progress);
    });
  });
  const tWinter = Date.now();
  await page.click('[data-testid=date-polar-winter]');
  await page.waitForSelector('[data-testid=date-note]', {timeout: 60_000});
  const winter_ms = Date.now() - tWinter;
  const winterProgress = await page.evaluate(() => (window as unknown as {__progress: number[]}).__progress);
  assert(winterProgress.length > 1 && Math.max(...winterProgress) === 1, 'no progress reported for the preset');
  assert.match((await page.textContent('[data-testid=date-range]'))!, /custom/i);
  assert.match((await page.textContent('[data-testid=date-active]'))!, /Custom range active/);
  assert.notEqual(await checksum(), real0, 'custom range did not change the scores');
  assert.equal(await page.locator('[data-testid=basis-select]').isDisabled(), true);
  await page.waitForTimeout(800);
  await page.screenshot({path: `${WEB}test-results/real-dates.png`});
  report.realFlow = {winter_ms, winterProgressTicks: winterProgress.length, header: await page.textContent('[data-testid=date-range]')};
  // documentation: KaTeX renders, the deep link scrolls to the heading, the map comes back at the right size
  await page.click('[data-testid=view-docs]');
  await page.waitForSelector('[data-testid=apollo-doc] .katex', {timeout: 30_000});
  assert.equal(await page.locator('.katex-error').count(), 0, 'KaTeX error nodes');
  await page.evaluate(() => (location.hash = '#doc=primer&h=kpi_ice'));
  await page.waitForTimeout(800);
  const heading = await page.evaluate(() => {
    const h = [...document.querySelectorAll('[data-testid=apollo-doc] h2, h3, h4')].find((e) => e.textContent?.trim() === 'kpi_ice');
    const pane = document.getElementById('apollo-scroll')!.getBoundingClientRect();
    const r = h?.getBoundingClientRect();
    return {found: !!h, inView: !!r && r.top >= pane.top - 1 && r.bottom <= pane.bottom, top: r && r.top - pane.top};
  });
  assert(heading.found && heading.inView, `kpi_ice heading not in view: ${JSON.stringify(heading)}`);
  assert.equal(await page.locator('.katex-error').count(), 0);
  await page.screenshot({path: `${WEB}test-results/real-docs-kpi_ice.png`});
  await page.evaluate(() => (location.hash = '#doc=modules'));
  await page.waitForSelector('[data-testid^=module-]');
  await page.screenshot({path: `${WEB}test-results/real-modules.png`});
  await page.click('[data-testid=view-map]');
  await page.waitForTimeout(1500);
  const back = await frame();
  assert(back.distinctColours > 100 && back.drawnFraction > 0.3, `map blank after returning: ${JSON.stringify(back)}`);
  const sizes = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=map] canvas') as HTMLCanvasElement;
    const m = document.querySelector('[data-testid=map]')!.getBoundingClientRect();
    return {canvasW: c.getBoundingClientRect().width, canvasH: c.getBoundingClientRect().height, mapW: m.width, mapH: m.height, buffer: c.width};
  });
  assert(Math.abs(sizes.canvasW - sizes.mapW) < 2 && Math.abs(sizes.canvasH - sizes.mapH) < 2 && sizes.canvasW > 400, `canvas size ${JSON.stringify(sizes)}`);
  report.mapAfterDocs = {...sizes, ...back};

  // 8. error state
  await page.goto(`${URL_BASE}?scenario=nope`);
  await page.waitForSelector('[role=alert]');
  assert.match((await page.textContent('[role=alert]'))!, /Unknown scenario "nope". Available: south-pole-2027, fixture/);

  report.consoleErrors = errors;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
  console.log('map-smoke: OK');
} catch (e) {
  console.log(JSON.stringify(report, null, 2));
  throw e;
} finally {
  await browser.close();
  preview.kill();
}
