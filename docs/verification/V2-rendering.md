# V2-rendering — verification report

Run date 2026-11-14. Spike: `spikes/V2-rendering/` (outputs in `spikes/V2-rendering/out/`).
The run was stopped early on the coordinator's instruction: claims A, B and the 2D part of C are finished; the 3D part of C and all of D (globe) were **not run**.

## Verdicts

| Claim | Verdict | Evidence | Exact names / versions / numbers |
|---|---|---|---|
| A. Headless WebGL without sudo | **VERIFIED** | `a_webgl.mjs` → `out/a_webgl.log`, `out/a_shell.png`, `out/a_chromium.png` | `pnpm exec playwright install chromium` (playwright 1.65.0) worked without sudo; no system libraries were missing. Chromium 158.0.8127.18 (builds `chromium-1254` and `chromium_headless_shell-1254`, about 700 MB in `~/.cache/ms-playwright`). With `--use-gl=angle --use-angle=swiftshader --enable-webgl`, both the headless shell and full Chromium give `WebGL 2.0 (OpenGL ES 3.0 Chromium)` on `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`, MAX_TEXTURE_SIZE 8192; readPixels and screenshots work. `--enable-unsafe-swiftshader` was not needed. |
| B. Cell enumeration by `gridDisk` + centre-latitude filter | **VERIFIED** (the count is 14,444, not "about 15,000") | `b_cells.mjs` → `out/b_cells.log` | h3-js 4.5.0. See the table below. No duplicates, no gaps, no pentagons in any cap. `polygonToCells` on a ring at −80° threw (`code: 1`), which supports not using polygon fill. |
| C (2D). Flat polar stereographic `PolygonLayer` + `BitmapLayer` in `OrthographicView` | **VERIFIED** | `src/main.ts`, `src/cells.ts`, `drive.mjs` → `out/c_flat.json`, `out/c_flat_uniform.json`, `out/c_flat_res6.json`, `out/c_flat_defaulttap.json`, `out/c_flat_full.png`, `out/c_flat_pole.png` | deck.gl 9.4.1 (`@deck.gl/core`, `layers`, `geo-layers` 9.4.1; luma.gl 9.4.2), vite 8.3.8, typescript 7.0.2. Details below. |
| C (3D). Tilt / extruded cells (`OrbitView`) | **UNCERTAIN** (not finished) | The page supports `?mode=orbit&extruded=1` and `&ortho=1`; it type-checks and builds. `out/c_orbit_extruded_full.png` was written before the run was stopped, but I have not looked at it, and no picking results exist. | Still to test: look at the screenshot, picking on extruded cells, `OrbitView({orthographic: true})`, and extruded cells in `OrthographicView` (expected to look flat, since that view is top-down only). |
| D. Globe (`_GlobeView` + `H3HexagonLayer`) | **UNCERTAIN** (not run at all) | The page supports `?mode=globe&hp=auto\|true\|false`; it type-checks and builds, but was never opened in a browser. | Nothing observed. Suspicions from memory only, not evidence: the cell containing the pole may triangulate wrongly in lng/lat space; a globe needs an equirectangular background, which is heavily stretched at the pole. |

### B — numbers

| Resolution, limit | Minimum k | Cells | Sum of cell areas (lunar) | Cap area | Mean cell area | Pentagons | Cells crossing ±180° |
|---|---|---|---|---|---|---|---|
| res 5, ≤ −80° | 77 | **14,444** | 288,164 km² | 288,139 km² | 19.95 km² (16.9–22.4) | 0 | 82 |
| res 5, ≤ −85° | 38 | **3,557** | 72,197 km² | 72,172 km² | 20.30 km² | 0 | 40 |
| res 6, ≤ −85° | 100 | **24,888** | 72,165 km² | 72,172 km² | 2.90 km² | 0 | 112 |

- "Minimum k" is the first k whose outermost ring lies wholly outside the cap; the count is unchanged at k + 10.
- Gap checks: every neighbour of a cap cell is in the set or outside the cap, and 721,440 sample points (0.02° × 0.25°) all map to a cell in the set.
- Polar cells are larger than the global mean (19.95 km² against the expected 18.8 km²), which is why the count is 14,444 rather than about 15,300.
- Pole cell at res 5: `85f29383fffffff` (centre −89.959°, 129.6°). The nearest res-5 pentagon is at −64.7°.
- In the −80° cap, 89 cells have 7 or 8 boundary vertices (they cross an icosahedron edge), so code must not assume six vertices.

### C (2D) — what was observed

Scene: 14,444 cells, 1000×800 viewport, software GL, on 2 cores shared with another job.

- **Rendering:** correct at full extent and zoomed 16× on the pole (both screenshots inspected). The pole cell is an ordinary hexagon; nothing is smeared at the pole or at ±180°.
- **Cracks:** the pixel test with opaque uniform fill (`?uniform=1`) found 0 non-fill pixels of 361,392 inside the cap, 0 non-empty of 408,312 outside it, and 0 of 800,000 at pole zoom.
- **Picking:** `pickObject`, real mouse hover and real mouse click returned the right cell at the 5 known cell centres (pole, −85°/180°, −82°/0°, −80.3°/90°, −88°/−90°). A 5×5 grid of screen positions, checked against `latLngToCell(unproject(pixel))`, matched 25/25 at full extent, after pan and zoom, and at pole zoom. Res 6 (24,888 cells) gave the same result.
- **Pan and zoom:** a mouse drag moved the pole by (110, 55) px for a (120, 60) px drag; I attributed the difference to a drag-start threshold without checking it. Wheel zoom changed the zoom from −9.78 to −8.68.
- **Background:** the `BitmapLayer` positioned by `bounds: [-E, -E, E, E]` in metres lines up with the cells, with longitude labels the right way round under `flipY: false`.
- **Recolour via `updateTriggers`:**

| Step | 14,444 cells (res 5) | 24,888 cells (res 6) |
|---|---|---|
| Score → colour loop (JS) | 1–15 ms | 1–10 ms |
| `setProps` + layer/attribute update (JS) | 9–52 ms | 15–52 ms |
| Frame under SwiftShader | 500–600 ms | 650–700 ms |
| Plain redraw under SwiftShader | about 370 ms | about 545 ms |

The JS side is fast enough for live slider drags; the frame time is the software rasteriser's, not something a real GPU would show.

Artefacts found:

1. **`stroked: true` is extremely slow under SwiftShader.** With the `PolygonLayer` outline (a `PathLayer`), a frame took 8–19 s against about 0.4 s without it. Not measured on a real GPU. The spike has `?shrink=0.9`, which shrinks each polygon towards its centre to leave gaps as a cheap outline; it builds but was not screenshotted.
2. **Clicks are lost when a pick takes over 250 ms.** deck.gl picks synchronously on pointerdown and its tap recogniser has a 250 ms limit. In `out/c_flat_defaulttap.json`, clicks failed exactly when the down→up gap exceeded 250 ms (259, 318, 445 ms) and succeeded below it. Raising the limit with `eventRecognizerOptions: {click: {time: 5000}}` made every click work. This matters for headless tests and for very slow machines.
3. Console shows luma.gl debug messages about uniform block reflection and "GPU stall due to ReadPixels" warnings; there were no deck errors.

### Layer configuration that worked (copy from `spikes/V2-rendering/src/`)

```ts
// cells.ts
const R = 1_737_400;
function stereo(lat, lon) { const r = 2*R*Math.tan(Math.PI/4 - Math.abs(lat)*Math.PI/360), l = lon*Math.PI/180; return [r*Math.sin(l), r*Math.cos(l)]; }
gridDisk(latLngToCell(-90, 0, 5), 80).filter(id => cellToLatLng(id)[0] <= -80)
// polygon = cellToBoundary(id).map(([lat, lon]) => stereo(lat, lon))   (no antimeridian handling needed)

// main.ts
new Deck({ views: new OrthographicView({flipY: false}), controller: true,
  initialViewState: {target: [0, 0, 0], zoom: Math.log2(Math.min(W, H) / (2.1 * E))},   // about -9.8 at 1000x800
  layers: [
    new BitmapLayer({id: 'bg', image, bounds: [-E, -E, E, E], coordinateSystem: COORDINATE_SYSTEM.CARTESIAN}),
    new PolygonLayer({id: 'cells', data: cells, getPolygon: d => d.poly, positionFormat: 'XY',
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, filled: true, stroked: false, pickable: true, autoHighlight: true,
      getFillColor: d => colour(d), updateTriggers: {getFillColor: version}}),
  ]});
```

`E` is the half-width of the image in stereographic metres. Recolouring means bumping `version` and calling `setProps({layers})` again.

## Recommendation

**Choose Option 1 (flat polar stereographic, `OrthographicView` + `PolygonLayer` in CARTESIAN metres) for tomorrow.** It is the only option with evidence: watertight, correct at the pole and at ±180°, picking exact, recolour cheap on the JS side. It also uses the hillshade in its native polar stereographic projection with no reprojection.

Option 2 (globe) is unverified. Do not build on it until `?mode=globe` has been run. If a 3D look is wanted, the next thing to test is `OrbitView` over the same Cartesian layers (`?mode=orbit&extruded=1`), which reuses all the Option 1 data.

## Concrete edits for PLAN.md

1. Line 86 (frontend stack): replace "`Deck.gl` (`GlobeView` + `H3HexagonLayer`)" with "`deck.gl` 9.4.1 (`OrthographicView({flipY:false})` + `PolygonLayer` + `BitmapLayer`, `COORDINATE_SYSTEM.CARTESIAN`, south polar stereographic metres); `h3-js` 4.5.0".
2. Line 92 (projections rule): replace "renderizar siempre sobre esfera 3D (`GlobeView`), nunca en Web Mercator" with "render in south polar stereographic metres (x = r·sin lon, y = r·cos lon, r = 2R·tan(π/4 − |lat|/2), R = 1,737,400 m) in an `OrthographicView`; never Web Mercator; `GlobeView` is unverified (see V2-rendering)". The `antimeridian` clean-up is not needed for the web polygons, since the projected boundaries have no ±180° seam.
3. Line 49 (viewer description "3D/esférico"): change to "2D polar stereographic viewer (3D tilt via `OrbitView` optional, unverified)".
4. Add the cell-set definition: `gridDisk(latLngToCell(-90, 0, 5), 80)` filtered by centre latitude ≤ −80° gives **14,444** cells (minimum k = 77), with no pentagons; do not use `polygonToCells` at the pole. The Python `h3` v4 pipeline should assert the same count. For ≤ −85°: res 5 gives 3,557 cells (k ≥ 38), res 6 gives 24,888 (k ≥ 100).
5. Line 93 (scale factor): add that polar res-5 cells average 19.95 km² on the Moon (16.9–22.4), not the global-mean 18.8 km²; use the per-cell `cellArea × 0.0744`.
6. Add rendering notes: default to `stroked: false` for cells (the outline `PathLayer` cost 8–19 s per frame in software GL; confirm on a real GPU before enabling it); cells can have 7 or 8 boundary vertices.
7. Add a testing note: Playwright Chromium 158 with `--use-gl=angle --use-angle=swiftshader --enable-webgl` works without sudo; in E2E tests set `eventRecognizerOptions: {click: {time: 5000}}` or clicks are dropped; expect about 0.4–0.6 s per frame.

## What I could not check and why

Stopped by the coordinator (budget) before these ran:

- **D, globe: everything.** Rendering at latitude −90°, `highPrecision` true / false / auto, picking, pan and zoom at the pole, the equirectangular `BitmapLayer`, and the documented `GlobeView` limitations (docs not read).
- **C, 3D:** `OrbitView` tilt with extruded and flat cells, orthographic `OrbitView`, extruded cells in `OrthographicView`. One screenshot exists (`out/c_orbit_extruded_full.png`) but is uninspected.
- **Screenshots not inspected:** only `out/c_flat_full.png` (first, stroked run) and `out/c_flat_pole.png` were looked at. The recoloured, after-pan-zoom, res-6 and uniform screenshots were judged by numbers only.
- **Stroked and shrink variants:** no screenshot of the final stroked or `shrink` pages.
- **Real GPU performance:** every timing is SwiftShader on 2 shared cores.
- **React:** the spike uses the plain `Deck` class, not `@deck.gl/react` `<DeckGL>`; the layer props are the same but the wrapper was not installed or tested.
- **Real hillshade:** the background was a generated 1024×1024 canvas, not a real image file or large texture (limit here is 8192 px).

To resume: `cd spikes/V2-rendering && pnpm exec vite build && pnpm exec vite preview` (port 5199), then in another shell `./run.sh "d_globe mode=globe&stroke=0&taptime=5000" "d_globe_uniform mode=globe&uniform=1" "c_orbit_extruded mode=orbit&extruded=1&taptime=5000"`, and `node summ.mjs <name>` for a summary. `node_modules` (681 MB) is inside the spike directory only; pnpm skipped the build script of `@vaadin/vaadin-usage-statistics`, which is harmless.
