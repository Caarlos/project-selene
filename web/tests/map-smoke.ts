// Headless check of the map on the fixture scenario. Not part of `pnpm test`. Run from web/ with Node 24:
//   node tests/map-smoke.ts
// Builds, serves the build on 127.0.0.1:4173, drives Chromium with software WebGL (SwiftShader), writes
// test-results/map-smoke.png and prints a JSON report. Frames take about 0.5 s here: only JS timings are asserted.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {cellToLatLng, latLngToCell} from 'h3-js';
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
  await page.goto(URL_BASE);
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

  // 8. error state
  await page.goto(`${URL_BASE}?scenario=nope`);
  await page.waitForSelector('[role=alert]');
  assert.match((await page.textContent('[role=alert]'))!, /Unknown scenario "nope". Available: fixture/);

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
