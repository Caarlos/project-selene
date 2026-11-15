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
const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']});
const report: Record<string, unknown> = {};
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

  // 6. error state
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
