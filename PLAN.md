# PLAN.md — `project-selene` architecture and implementation specification

**Status:** v2 (2026-11-14). Rewritten in English from the Gemini planning conversation, with the content lost in its last revision restored and the technical corrections from the plan review applied.

**How the documents fit together**

| Document | Purpose | Reader |
|---|---|---|
| `PLAN.md` (this file) | What to build and the rules for building it. Source of truth for agents. | Agents, technical reviewers |
| `docs/TECHNICAL_PRIMER.md` | The basics (Moon geometry, horizons, illumination, grids) and why each decision was taken, in plain language. | The project owner, judges, newcomers |
| `HUMAN_ACTION.md` | Things only the human can do, and the log of decisions taken on the human's behalf, for review. | The project owner |
| `docs/verification/*.md` | Evidence for assumptions marked **[unverified]** below. | Agents |

Items marked **[unverified]** must not be built on until the matching verification report confirms them or this plan is updated.

---

## 1. Overview and context

* **Repository:** `project-selene`
* **System title:** **SELENE** (*Selenographic Exploration & Lunar Environment Navigation Engine*)
* **Context:** NASA Space Apps Challenge 2026, challenge *Lunar Landing Site Navigator*. **A working demonstrator is needed by 2026-11-15.**
* **Goal:** an interactive, scientifically defensible web platform to evaluate, compare and select landing and base sites at the **lunar south pole (80°S–90°S)**, designed so that other regions and time windows can be added later.
* **Language:** English for code, UI and documentation.
* **Identity and outreach:** A master core (SELENE) coordinates eight subordinate modules, each named after a Greco-Roman deity whose myth mirrors its job, with an aerospace-style backronym. The naming is an outreach device: it lets the project explain astrodynamics and lunar topography to any audience. Do not use artwork, logos or text from others, and do not use the NASA insignia.
* **Where things run:**
  * **Development VPS** (Linux, 2 cores, 3.7 GB RAM, no GPU): agents write code and tests, and run the pipeline at overview resolution. Headless Chromium for visual checks must be launched with `--use-gl=angle --use-angle=swiftshader --enable-webgl`.
  * **Local workstation** (Ryzen 5 + RTX 2060): the human runs the pipeline at higher fidelity (finer DEM, finer azimuth step, more detail patches) and validates the viewer with real GPU acceleration.
  * **End user:** a browser with WebGL 2. No server: the app is fully static.

---

## 2. Ecosystem: core + 8 modules

The system separates **heavy physics (offline Python pipeline)** from **interactive exploration (static web app)**. The two halves talk only through the data contract in §6.

| Module | Backronym | Myth (for outreach) | Responsibility | Time nature | Runs in |
|---|---|---|---|---|---|
| **SELENE** (core) | Selenographic Exploration & Lunar Environment Navigation Engine | Greek personification of the Moon | Orchestrator: grid standard, data contract, build CLI, scenario state in the web app | n/a | both |
| **HYPERION** | High-resolution Yield, Polar Elevation & Relief Indexing Observation Network | Titan of watchfulness from above, father of Selene | DEM ingestion, lunar H3 grid, sample points, 360° horizon profiles by ray tracing, sky view factor, hillshade | static | pipeline |
| **EOS** | Ephemeris & Orbital Sunlight Simulator | Goddess of the dawn | Sun direction vs local horizon: sunlight %, longest continuous darkness | date-dependent | pipeline + browser |
| **HESTIA** | Hydration, Environmental Stability & Thermal Ice Assessment | Goddess of the hearth | Water-ice stability index from permanent shadow and Diviner temperatures, thermal amplitude | static (multi-year) | pipeline |
| **ARGUS** | Azimuthal Roughness, Gradient & Unobstructed-landing Surveyor | The hundred-eyed giant | Slope, safe-area fraction, roughness (TRI), topographic shielding from micrometeoroids and radiation | static | pipeline |
| **HERMES** | Hexagonal Earth-Relay & Mission Ephemeris System | Messenger of the gods | Direct-to-Earth link: Earth direction vs local horizon (lunar segment) and Moon visibility from the DSN stations (ground segment) | date-dependent | pipeline + browser |
| **ASTRAEA** | Adaptive Site-selection & Terrain Risk Analysis Exploration App | Goddess of precision and the scales | Map viewer, multi-criteria engine (MCDA) with live weight sliders, hard filters, cell inspector with horizon chart | n/a | browser |
| **ARTEMIS** | Adaptive Reconnaissance & Targeted Exploration Mission Integration System | Twin of Apollo; NASA's return-to-the-Moon programme | Operations layer: mission presets, base-to-ice distance, battery estimate, A/B comparator, date selector | n/a | browser |
| **APOLLO** | Accessible Platform for Open Lunar Learning & Outreach | God of knowledge; NASA's first lunar programme | Documentation and outreach: formulas, sources, module stories, validation | n/a | docs + browser |

DSN stations (HERMES ground segment): **Madrid** 40.4314°N, 4.2481°W; **Goldstone** 35.4267°N, 116.8900°W; **Canberra** 35.4014°S, 148.9817°E.

---

## 3. Key technical decisions

Each decision is explained for a non-specialist in `docs/TECHNICAL_PRIMER.md` and logged for review in `HUMAN_ACTION.md` under the same ID.

| ID | Decision |
|---|---|
| D-01 | **Grid:** H3 used as a purely spherical index; its latitude/longitude are read as selenographic coordinates. Lengths are scaled by 1737.4/6371.0 = 0.2727 and areas by 0.0744. **Overview grid: resolution 5** over 80°S–90°S (14,444 cells; polar cells average 19.95 km², range 16.9–22.4; always use the per-cell area × 0.0744). **Detail grid: resolution 7** (0.38 km², edge 380 m) only on named patches (§5.1). Resolution 8 is reserved for workstation runs. |
| D-02 | **Cells are enumerated** with `grid_disk` around the cell containing the pole, filtered by centre latitude. Polygon-fill functions are not used at the pole (they throw there). Verified (V2-B): `gridDisk(latLngToCell(-90, 0, 5), 80)` filtered by centre latitude ≤ −80° gives exactly **14,444** cells, no pentagons, no gaps; pipeline and web both assert this count. Cells can have 7 or 8 boundary vertices; never assume six. |
| D-03 | **Several sample points per cell**, not one. 7 lattice points (centre + 6 at 0.6 of the circumradius) plus the highest DEM pixel in the cell. Metrics are reported as **mean** (over the 7 lattice points) and **best point** (best of all 8). |
| D-04 | **Horizon ray tracing:** 360 azimuths (1° step), range 150 km, exact spherical geometry (curvature included), observer 2 m above the surface. The horizon DEM must extend at least 5° of latitude beyond the analysis cap. |
| D-05 | **Sun as a disc**, not a point: the lit fraction grows linearly while the disc (radius 0.266°) crosses the horizon. |
| D-06 | **One ephemeris source:** a table of sub-solar and sub-Earth points fetched once from JPL Horizons (DE441, frame MOON_ME, physical libration included), cached in the repo, covering 2026-01-01 to 2036-01-01 hourly (87,648 rows). Pipeline and browser both read it. No per-cell Horizons queries, never any live Horizons call from the browser. Verified (V1-D). |
| D-07 | **Baseline scenario: the full calendar year 2027**, hourly. One or two months would be unrepresentative because polar lighting has a seasonal cycle of about 347 days. |
| D-08 | **Custom date ranges are computed in the browser** (Web Worker) from each cell's stored best-point horizon and the ephemeris table. The "degraded mode" of plan v1 is removed: no module is switched off. Values that only the pipeline produces (per-cell means) are labelled "baseline only". |
| D-09 | **DSN visibility is a per-scenario quantity, not a per-cell one** (the Moon's elevation over a ground station does not depend on the lunar site). It is computed in the browser with `astronomy-engine` and shown once, plus combined with each cell's Earth-visibility window. |
| D-10 | **Map view: flat south-polar stereographic projection** in deck.gl (cartesian coordinates in metres), over a hillshade image exported by the pipeline. The 3D globe (`GlobeView`) is kept for the deferred global mode and only adopted if its spike passes. Flat view verified (V2-C): deck.gl 9.4.1 `OrthographicView({flipY:false})` + `PolygonLayer` + `BitmapLayer` in `COORDINATE_SYSTEM.CARTESIAN`, watertight, exact picking; copy from `spikes/V2-rendering/src/`. Globe and 3D tilt (`OrbitView`) were **not tested**: do not build on them. |
| D-11 | **Cell geometry is not shipped.** The browser derives each hexagon from its H3 index (`h3-js`) and projects it. `antimeridian` and `shapely` are dropped from the stack. |
| D-12 | **The pipeline exports raw physical metrics only.** Normalised KPIs (0–1), scores, nearest-ice distance and filters are computed in the browser from fixed physical anchors (§7.2), so they stay comparable between scenarios and regions. |
| D-13 | **Synthetic mode is a synthetic DEM, not a second generator.** `--synthetic` feeds an analytic terrain (sphere + crater + ridge) through the same pipeline code, which doubles as the test fixture. |
| D-14 | **KPIs without a dataset or formula are renamed or dropped:** "ice probability" becomes an **ice stability index**; "regolith cover viability" is dropped; the antenna-size estimator is deferred (§14). |
| D-15 | **Global mode is deferred**, not cancelled (§14). Nothing in v1 may hard-code "south pole" where a region parameter costs nothing. |

---

## 4. Data sources

Raw inputs are downloaded by `pipeline/fetch_data.py` into `data/raw/` (git-ignored), with file size and SHA-256 recorded in `data/raw/SOURCES.json`. Exact product names and URLs come from `docs/verification/V1-data-ephemeris.md`.

| Input | Used by | Product | Status |
|---|---|---|---|
| LOLA elevation 75°S–90°S, 120 m/px | HYPERION (horizons, hillshade, label raster) | `ldem_75s_120m.img` + `.lbl` (116 MB, 7624², int16) from `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/` | verified, already in `data/raw/` |
| LOLA elevation 80°S–90°S, 20 m/px | ARGUS slopes | `ldem_80s_20m.jp2` (268 MB, 30400², 1024-px tiles, read in windows) from `.../lola_gdr/polar/jp2/`. Fallback if local decoding is too slow: `ldem_80s_80m.jp2` (30 MB, already in `data/raw/`) | exists; full local decode of the 20 m file untested |
| Diviner Polar Resource Product (thermal model, Paige et al. 2010): annual maximum and annual average surface temperature, about 507 m | HESTIA | `dlre_prp_south.zip` (117 MB, ASCII table) from `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/extras/prp/`, converted to a 3-band GeoTIFF by a pipeline step (working converter: `spikes/V1-data-ephemeris/diviner_prp_to_geotiff.py`). Use `temp_max_K` and `temp_avg_K`; ignore the ice-depth band | verified, converted file in `data/raw/` |
| LOLA permanently shadowed regions | HESTIA | `LPSR_75S_120M_201608.TIF` (1 MB) from `https://pgda.gsfc.nasa.gov/data/MoonIllumination/`; same pixel grid as the horizon DEM; DN +20000 = permanent shadow | verified, in `data/raw/` |
| LOLA average Sun and Earth visibility (Mazarico et al. 2011) | validation only (§11) | `AVGVISIB_75S_120M_201608.TIF` and `..._EARTH.TIF` from the same folder; value = DN × 0.00004; same grid as the horizon DEM. Use the plain `.TIF`, the `_COG.TIF` links are stubs | verified, in `data/raw/` |
| JPL Horizons sub-solar and sub-Earth points, Earth–Moon range | EOS, HERMES | One plain HTTP GET per calendar year to `https://ssd.jpl.nasa.gov/api/horizons.api`: `COMMAND='301'`, `CENTER='500@399'`, `EPHEM_TYPE='OBSERVER'`, `QUANTITIES='14,15,20'`, `STEP_SIZE='1 h'`, `ANG_FORMAT='DEG'`, `RANGE_UNITS='KM'`, `CSV_FORMAT='YES'`. Limit 90,000 rows per request. Working script: `spikes/V1-data-ephemeris/fetch_ephemeris.py` (standard library only) | verified |

Higher-fidelity alternatives for the workstation (not downloaded): `LDEM_80S_20MPP_ADJ.TIF` (2.7 GB, metres, Barker et al. 2023) and `LPSR_80S_20MPP_ADJ.TIF` (154 MB) from `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/`; `ldem_60s_240m.img` (120 MB) if terrain beyond 75°S is ever needed.

All NASA data are public domain; credit the instrument teams in `README.md` and in the APOLLO page.

**Fallback if Diviner or PSR products cannot be obtained in time:** HESTIA derives a shadow proxy from our own EOS result (fraction of a cell's sample points with zero sunlight over the baseline year), labels it "shadowed all of 2027 (proxy)" in the manifest and UI, and leaves the temperature fields null.

---

## 5. Physics specification

Conventions used everywhere:

* Moon reference sphere radius **R = 1737.4 km**. DEM heights are relative to this sphere.
* Selenographic coordinates: planetocentric latitude, **east-positive longitude in (−180°, 180°]**.
* Moon-fixed cartesian frame: +z north pole, +x at longitude 0°, +y at longitude 90°E. Unit vector for (lat φ, lon λ): `(cos φ cos λ, cos φ sin λ, sin φ)`.
* Local frame at a point: Up `u` = its unit vector; East `e = (−sin λ, cos λ, 0)`; North `n = (−sin φ cos λ, −sin φ sin λ, cos φ)`.
* **Azimuth: degrees clockwise from local north** (east = 90°). **Elevation:** degrees above the local horizontal plane.
* Time: UTC, ISO 8601.
* DEM projection parameters are **read from the file**, and asserted against the verified convention of the LOLA polar products: `+proj=stere +lat_0=-90 +lon_0=0 +R=1737400`, true scale at the pole; for 0-based pixel centres in a W × H raster of pixel size `px`: `x = (col − W/2 + 0.5)·px`, `y = (H/2 − 0.5 − row)·px`, `lon = atan2(x, y)`, `lat = −90° + 2·atan(hypot(x, y) / 2R)`. Longitude 0° points up, 90°E right.
* **LOLA height in metres = DN × 0.5.** Through the `.lbl` rasterio reports `scale 0.5` and `offset 1737400` (that pair gives radius, not height); `.jp2` files carry no scale at all. Apply `× 0.5` explicitly and test the pole value (about 1,280–1,300 m) and Shackleton's floor at 89.67°S, 129.2°E (about −2,790 m).
* Horizons longitudes arrive east-positive in 0–360°; wrap to (−180°, 180°] when building the table.

### 5.1 HYPERION — grid, sample points, horizons

**Grids.** `cap_r5`: all resolution-5 cells with centre latitude ≤ −80°. Detail patches at resolution 7, each a 50 km square centred on a named site, in priority order: `shackleton_ridge` (Shackleton rim and the ridge towards de Gerlache), `malapert` (Malapert massif), `cabeus` (Cabeus crater floor). Patch centres are given in `pipeline/regions.json` and taken from the IAU nomenclature gazetteer, not from memory.

**Sample points (D-03).** For each cell: the centre, six points at 0.6 × circumradius towards the vertices, and the highest DEM pixel inside the cell. Cell membership of DEM pixels comes from a **label raster**: cell polygons rasterised once in DEM pixel coordinates (`rasterio.features.rasterize`).

**Horizon profile (D-04).** For observer point `P` (unit vector `p`, radius `r0 = R + h(P) + 2 m`) and azimuth `A`, the tangent direction is `t = n cos A + e sin A`. A point at arc angle `s` along the great circle is `q = p cos s + t sin s`; it is projected to DEM pixel coordinates and its height `h(q)` read by bilinear interpolation, giving `r1 = R + h(q)`. Its elevation angle seen from the observer is

$$\text{el}(s) = \operatorname{atan2}\big(r_1 \cos s - r_0,\; r_1 \sin s\big)$$

and the horizon is `H(A) = max over s of el(s)`. This is exact on the sphere, so curvature needs no separate correction. Step table (distance `d = R·s`): step = `max(pixel size, 0.004 · d)` out to 150 km, shared by all rays (`cos s`, `sin s` precomputed). Rays leaving the DEM stop there and the cell is flagged `horizon_truncated`. Implementation: Numba, parallel over points. Parameters (`--az-step`, `--range-km`, `--observer-height-m`) are CLI options recorded in the manifest.

**Sky view factor.** With `H⁺ = max(H, 0)`:

$$\text{SVF} = \frac{1}{N_A}\sum_{A} \cos^2 H^{+}(A)$$

1 means the whole sky hemisphere is open; lower means the terrain blocks part of it.

**Hillshade.** A shaded-relief image of the DEM over the analysis cap, exported as WebP with its bounds in projection metres.

### 5.2 Sun and Earth directions from the ephemeris table

The table gives, per hour: sub-solar point `(λs, φs)`, sub-Earth point `(λe, φe)` and Earth–Moon centre distance `D`. For a point with unit vector `p` at radius `r`:

* Sun direction: `d = unit(φs, λs)` (the Sun is far enough that parallax across the Moon, under 0.001°, is ignored).
* Earth direction: `d = normalise(D · unit(φe, λe) − r · p)` (parallax up to 0.26° is kept).
* Elevation `= asin(d·u)`, azimuth `= atan2(d·e, d·n)`.

### 5.3 EOS — sunlight

Lit fraction at each time step, with solar angular radius `ρ = 0.266°` and the horizon linearly interpolated at the Sun's azimuth:

$$f = \operatorname{clamp}\!\left(\frac{\text{el}_\odot + \rho - H(A_\odot)}{2\rho},\, 0,\, 1\right)$$

* `sun_pct` = 100 × mean of `f` over the scenario.
* `dark_max_h` = longest run of consecutive steps with `f = 0`, in hours. A run touching either end of the scenario is still counted and flagged in the manifest as possibly truncated.

### 5.4 HERMES — Earth link

* Lunar segment: Earth visible when its centre elevation exceeds `H(A) + mask`, default mask 0°. `earth_pct` and `earth_outage_max_h` are defined like the EOS metrics.
* Ground segment (browser, D-09): for each DSN station, the Moon is usable when its elevation exceeds 10° (`astronomy-engine`). Output: per-station windows, percentage of time with at least one station, and for the selected cell the combined availability (Earth visible from the cell **and** at least one station sees the Moon).

### 5.5 ARGUS — terrain safety and shielding

On the slope DEM, per pixel: slope from the Horn 3×3 gradient, `slope = atan |∇h|`; Terrain Ruggedness Index = mean absolute height difference to the 8 neighbours (metres). Per cell: `slope_mean_deg`, `slope_p95_deg`, `tri_m`, and `safe_frac` = fraction of pixels with slope below 10° (`--safe-slope-deg`). **Slope depends on the baseline it is measured over**; the DEM pixel size used is recorded as `slope_baseline_m` in the manifest and shown in the UI. Shielding uses SVF from §5.1 (mean over lattice points).

South-pole geology rule: there are no mapped volcanic lava tubes in the south polar highlands. Protection from micrometeoroids and radiation is evaluated through topographic shielding (SVF) only. Lava tubes and pits belong to the deferred global mode.

### 5.6 HESTIA — ice and temperature

Per cell, from rasters sampled through the label raster: `tmax_k`, `tavg_k` (cell means of the Diviner product's annual maximum and annual average temperature; it has no minimum), `psr_frac` (fraction of the cell inside a permanently shadowed region), and

* `ice_index` = fraction of the cell's pixels with `Tmax < 110 K` (surface water ice is stable against sublimation below roughly 110 K). It is an **index of thermal stability, not a probability that ice is present**.
* `thermal_amp_k = tmax_k − tavg_k` (maximum above the annual average; a lower bound on the full swing).
* The temperature source is a thermal model at about 507 m, fitted to early Diviner data, and it covers ±304 km around the pole. State this wherever the values are shown.

---

## 6. Data contract (pipeline → web)

Written by the pipeline to `web/public/data/<scenario_id>/`. Schema version 1. JSON Schema files live in `pipeline/schema/` and are validated in tests on both sides.

**`manifest.json`**

```json
{
  "schema_version": 1,
  "scenario_id": "south-pole-2027",
  "synthetic": false,
  "generated_at": "2026-11-14T20:00:00Z",
  "region": {"name": "south_pole", "lat_max": -80},
  "time": {"start": "2027-01-01T00:00:00Z", "end": "2028-01-01T00:00:00Z", "step_s": 3600},
  "params": {"az_step_deg": 1, "range_km": 150, "observer_height_m": 2, "safe_slope_deg": 10,
             "samples_per_cell": 8, "slope_baseline_m": 20, "ice_source": "diviner"},
  "sources": [{"name": "...", "url": "...", "sha256": "..."}],
  "projection": {"type": "south_polar_stereographic", "radius_m": 1737400},
  "hillshade": {"file": "hillshade.webp", "bounds_m": [-304000, -304000, 304000, 304000]},
  "ephemeris": {"file": "../ephemeris_2026_2036.bin", "t0": "2026-01-01T00:00:00Z", "step_s": 3600, "n": 87648},
  "grids": [{"id": "cap_r5", "res": 5, "n_cells": 14444, "cells": "cells_cap_r5.json", "horizons": "horizons_cap_r5.bin"}]
}
```

**`cells_<grid>.json`** — columnar (one array per field, all of length `n_cells`, same order). `null` where a value is unavailable.

| Field | Unit | Meaning |
|---|---|---|
| `h3` | string | H3 index |
| `lat`, `lon` | deg | cell centre |
| `elev_m` | m | mean elevation |
| `best_lat`, `best_lon` | deg | best-point location (highest `sun_pct`) |
| `sun_best_pct`, `sun_mean_pct` | % | EOS |
| `dark_max_h_best`, `dark_max_h_mean` | h | EOS |
| `earth_best_pct`, `earth_mean_pct` | % | HERMES |
| `earth_outage_max_h_best` | h | HERMES |
| `svf` | 0–1 | sky view factor, lattice mean |
| `slope_mean_deg`, `slope_p95_deg`, `safe_frac`, `tri_m` | deg, deg, 0–1, m | ARGUS |
| `tmax_k`, `tavg_k`, `thermal_amp_k`, `psr_frac`, `ice_index` | K, K, K, 0–1, 0–1 | HESTIA |
| `horizon_truncated` | bool | a ray left the DEM before 150 km |

**`horizons_<grid>.bin`** — little-endian `Int16`, `n_cells × 360` values, row order as `cells`, column = azimuth 0°…359°, unit 0.01°. It is the horizon of the **best point** of each cell. Loaded lazily (inspector and custom dates).

**`ephemeris_2026_2036.bin`** (shared by all scenarios) — little-endian `Float32`, `n × 5` values per row: sub-solar lon, sub-solar lat, sub-Earth lon, sub-Earth lat (degrees), Earth–Moon distance (km).

**`hillshade.webp`** — shaded relief, bounds in the manifest.

---

## 7. Web application

### 7.1 ASTRAEA — viewer

* Map: deck.gl, flat south-polar stereographic view (D-10). Projection used by the browser for cell outlines and points: `r = 2R·tan(π/4 − |φ|/2)`, `x = r·sin λ`, `y = r·cos λ`. Layers: hillshade bitmap, cells coloured by the score or by any single metric, selected and pinned cells, base-to-ice link.
* Zooming into a detail patch swaps the overview cells for that patch's resolution-7 cells (outline of each available patch is drawn on the overview).
* Cell inspector: all raw metrics with units; a 360° horizon chart (ECharts) with the Sun and Earth tracks for the active date range drawn over the terrain horizon.
* Hard filters (excluded cells are greyed, never hidden): minimum `safe_frac`, maximum `slope_p95_deg`, maximum `dark_max_h_best`, minimum `earth_best_pct`.
* Rendering rules from the spike: cells use `stroked: false` (the outline layer took 8–19 s per frame in software rendering; enable outlines only after checking on a real GPU, or shrink polygons slightly to leave gaps); set `eventRecognizerOptions: {click: {time: 5000}}` so clicks are not dropped when picking is slow.
* Performance target: recomputing scores and recolouring all overview cells after a slider move in **under 100 ms** on a normal laptop, with no network request.

### 7.2 MCDA engine

Normalised KPIs in [0, 1], computed in the browser from fixed anchors kept in `web/src/services/kpiConfig.ts` (initial values; tune after the first real data run, then record the change in `HUMAN_ACTION.md`):

| KPI | Module | Formula |
|---|---|---|
| `kpi_sun` | EOS | `sun_best_pct / 100` |
| `kpi_comms` | HERMES | `earth_best_pct / 100` |
| `kpi_terrain` | ARGUS | `safe_frac` |
| `kpi_ice` | HESTIA | `clamp(1 − d_ice / 30 km, 0, 1)`, where `d_ice` is the surface distance to the nearest cell with `ice_index ≥ 0.2` (0 if the cell itself qualifies) |
| `kpi_protection` | ARGUS | `clamp((1 − svf) / 0.25, 0, 1)` |

Weighted score, with user weights `w_k ≥ 0`:

$$\text{Score}_i = \frac{\sum_k w_k \,\text{KPI}_{i,k}}{\sum_k w_k}$$

A KPI whose inputs are null for a scenario is left out of both sums and its slider is shown as unavailable with the reason.

### 7.3 Dates (ARTEMIS + EOS + HERMES)

* Default: the precomputed baseline scenario (2027).
* Custom range (D-08): any range inside the ephemeris table, up to 366 days. A Web Worker recomputes `sun_best_pct`, `dark_max_h_best`, `earth_best_pct`, `earth_outage_max_h_best` for all cells from `horizons_*.bin` and the ephemeris table, with a progress indicator, then scores and DSN windows update. Per-cell mean metrics show "baseline only". A visible note states that custom-date values use each cell's best-point horizon and that `python -m pipeline.selene_build --start-date … --end-date …` produces the full-fidelity scenario.
* The same TypeScript functions drive the inspector tracks. They must reproduce the pipeline's numbers (§11).

### 7.4 ARTEMIS — operations layer

* **Mission presets** set weights and filters in one click. Values are editorial assumptions of this project, not NASA requirements, and are labelled so:

  | Preset | sun | comms | terrain | ice | protection | Filters |
  |---|---|---|---|---|---|---|
  | Artemis III (crewed sortie) | 0.30 | 0.30 | 0.30 | 0.05 | 0.05 | `slope_p95_deg ≤ 10`, `earth_best_pct ≥ 50` |
  | CLPS (ice prospecting rover) | 0.15 | 0.15 | 0.20 | 0.50 | 0.00 | `slope_p95_deg ≤ 15` |
  | Base Camp (permanent habitat) | 0.30 | 0.15 | 0.15 | 0.25 | 0.15 | `dark_max_h_best ≤ 150` |

* **Base ↔ ice:** for the selected cell, the nearest ice-bearing cell, the surface distance (great-circle, lunar radius) and the steepest `slope_mean_deg` among cells on the straight line between them.
* **Battery estimate:** `m = P · t / (e · DoD)` with `t = dark_max_h_best`, and editable `P` (default 1 kW survival load), `e` (default 200 Wh/kg) and depth of discharge (default 0.8). Shown as indicative.
* **A/B comparator:** pin up to three cells; side-by-side table of metrics, KPIs and score.

### 7.5 APOLLO — knowledge

* In-app page that renders `docs/TECHNICAL_PRIMER.md` and `docs/outreach_guide.md` (Markdown + KaTeX), so documentation has a single source.
* Every metric in the inspector links to its section there (formula and data source).
* Module cards with patch image, backronym and myth.

---

## 8. Stack

* **Pipeline (Python 3.12, `venv` + `pip`, `pyproject.toml`):** `numpy`, `numba`, `rasterio`, `h3` (v4), `pillow` (hillshade), `jsonschema`; dev: `pytest`, `ruff`.
* **Web (Node 24, `pnpm`, Vite, React 18+, TypeScript strict):** `deck.gl` 9.4.1, `h3-js` 4.5.0, `echarts`, `astronomy-engine` (DSN only), `zustand`, Tailwind CSS, `react-markdown` + `remark-math` + `rehype-katex`; dev: `vitest`, `playwright`.
* **Hosting:** any static host (GitHub Pages, Cloudflare Pages, Vercel). Choice is a human decision (`HUMAN_ACTION.md`).
* No new dependency without a line in the hand-off explaining why the standard library or an installed package was not enough.

---

## 9. Critical constraints

1. **Polar geometry.** Do topographic maths in the DEM's own polar stereographic metres or in 3D vectors, never in raw latitude/longitude differences. Never render in Web Mercator.
2. **Lunar scale.** Never use a distance or area from an Earth library unscaled. Lengths × 0.2727, areas × 0.0744, or compute directly with R = 1737.4 km.
3. **Horizon fidelity.** Parameters of D-04 are minimums for published numbers. Lower-fidelity runs must say so in the manifest.
4. **Libration.** Sun and Earth directions as seen from the Moon come from the Horizons-derived table (D-06) in v1, in both pipeline and browser. `astronomy-engine` is otherwise used for the view from Earth stations. Verified extension, not in v1: `astronomy-engine` via `RotationAxis` reproduces the table within 0.01° (`spikes/V1-data-ephemeris/node/selenographic.ts`), so it may later serve dates outside the table. `Libration()` alone is less accurate in latitude (0.03°).
5. **Earth is treated as its centre.** A specific ground station sits up to about 1° away from it as seen from the Moon; v1 ignores this and says so.
6. **No live Horizons calls** from the browser or from tests. Tests use the cached table.
7. **Geological honesty.** No lava tubes at the south pole (§5.5). "Index", not "probability", for ice (§5.6).
8. **No invented data.** A metric that cannot be computed is `null` with a reason; synthetic scenarios carry `synthetic: true` and the UI shows a permanent "synthetic data" banner.

---

## 10. Repository structure

```text
project-selene/
├── PLAN.md                     # this specification
├── HUMAN_ACTION.md             # human tasks + decision log for review
├── README.md                   # project story, module table, quick start, credits
├── assets/patches/             # SELENE diagram and the 8 module patches (human-provided)
├── pipeline/                   # offline Python pipeline
│   ├── hyperion/               # DEM io, grid, sample points, label raster, horizons, SVF, hillshade
│   ├── eos/                    # sunlight metrics
│   ├── hermes/                 # ephemeris table fetch/cache, direction geometry, Earth link metrics
│   ├── argus/                  # slope, safe fraction, TRI
│   ├── hestia/                 # Diviner/PSR sampling, ice index, shadow proxy
│   ├── schema/                 # JSON Schemas of the data contract
│   ├── regions.json            # analysis cap and detail patches
│   ├── fetch_data.py           # downloads raw inputs with checksums
│   └── selene_build.py         # CLI: --region --res --start-date --end-date --synthetic ...
├── data/raw/                   # downloaded inputs (git-ignored) + SOURCES.json
├── web/                        # static frontend (ASTRAEA + ARTEMIS + APOLLO)
│   ├── public/data/            # pipeline artefacts (committed for the baseline scenario)
│   └── src/
│       ├── components/{astraea,artemis,apollo}/
│       └── services/           # data loading, projection, ephemeris geometry, MCDA, DSN, worker
├── docs/
│   ├── TECHNICAL_PRIMER.md     # basics + rationale (APOLLO)
│   ├── outreach_guide.md       # module myths and mission story (APOLLO)
│   └── verification/           # evidence for assumptions
└── spikes/                     # throwaway verification code (git-ignored)
```

---

## 11. Testing and validation

**Unit tests with known answers (required, pipeline):**

* Smooth sphere, observer at 2 m: horizon = −0.087° at every azimuth (dip = `acos(R/(R+h))`).
* Observer at the centre of an analytic crater of rim height `Hr` at distance `Dr`: horizon matches the closed-form value from the formula in §5.1 within 0.02°.
* At a point 1 km from the pole on a smooth sphere, Sun elevation ≈ −(sub-solar latitude) within 0.05°; azimuth advances with sub-solar longitude.
* H3 scaling: resolution-5 polar cell area between 16.9 and 22.4 km², mean ≈ 19.95 km²; cap cell count exactly 14,444.
* Longest-run and lit-fraction functions on hand-made series.
* Slope of an analytic inclined plane.

**Parity (required, both sides):** the pipeline writes `tests/vectors/ephem_geometry.json` (times, points, expected Sun/Earth azimuth and elevation, expected `sun_pct` for three cells over one month). The TypeScript implementation must match within 0.01° and 0.1 percentage points.

**Contract:** artefacts validate against the JSON Schemas; the web loader rejects a wrong `schema_version` with a clear message.

**Web:** `vitest` for MCDA (weights, missing KPI, filters), projection round-trip, nearest-ice. One Playwright smoke test with SwiftShader: app loads, canvas is non-blank, a slider changes colours, clicking a cell opens the inspector, no console errors. Verified (V2-A): Playwright 1.65 Chromium installs without sudo and gives WebGL 2 under SwiftShader; expect 0.4–0.6 s per frame, so assert on JavaScript timings, not frame rate.

**Scientific validation (after the first real run, report in the APOLLO page):**

* Compare `sun_mean_pct` and `earth_mean_pct` with the published LOLA maps (`AVGVISIB_75S_120M_201608*.TIF`); report the mean difference and the correlation. Expect a small systematic offset: those maps average 18.6 years and count any visible part of the disc.
* Check that well-known high-illumination sites (Shackleton rim, the connecting ridge, Malapert) rank near the top of `sun_best_pct` and that large PSRs (Shackleton floor, Cabeus, Haworth) come out dark.
* Overlay NASA's Artemis III candidate regions and report how they score under the Artemis III preset.

---

## 12. Roadmap and task list

Priorities: **P0** must be done for the demonstrator; **P1** should; **P2** could. ★ marks tasks that need the strongest model (physics kernels and the pieces everything else builds on). At most two workers run in parallel (2-core VPS); the pipeline track and the web track are independent after T0.

| ID | Pri | Task | Depends on | Owns |
|---|---|---|---|---|
| T0 ★ | P0 | Bootstrap: git, `pyproject.toml`, venv, web scaffold, lint/test commands, JSON Schemas of §6, `.gitignore` (`data/raw/`, `spikes/`, virtualenvs, `node_modules`), and `pipeline/fixture.py` that writes a small schema-valid placeholder scenario (`synthetic: true`) so the web track can start. Apply the `WARNING.md` actions: pnpm overrides `image-size >=2.0.3` and `fflate >=0.7.5`, upgrade `pip` in the venv before installing, exact versions pinned | none | repo root, `pipeline/schema/`, `pipeline/fixture.py`, `web/` scaffold |
| P1 ★ | P0 | Grid, projection, DEM io, label raster, sample points, synthetic DEM | T0 | `pipeline/hyperion/` (grid, io) |
| P2 ★ | P0 | Horizon ray tracer (Numba), SVF, hillshade, known-answer tests | P1 | `pipeline/hyperion/` (horizon) |
| P3 ★ | P0 | Ephemeris table fetch + cache, direction geometry, EOS and HERMES metrics, parity vectors | T0 | `pipeline/hermes/`, `pipeline/eos/` |
| P4 | P0 | ARGUS slope, safe fraction, TRI | P1 | `pipeline/argus/` |
| P5 | P1 | HESTIA from Diviner + PSR; shadow proxy fallback | P1, P3 | `pipeline/hestia/` |
| P6 ★ | P0 | `selene_build.py` CLI, export, `fetch_data.py`, **real baseline run** on `cap_r5`, artefacts committed | P2, P3, P4 | `pipeline/selene_build.py`, `pipeline/fetch_data.py`, `web/public/data/` |
| P7 | P1 | Detail patch `shackleton_ridge` at resolution 7 (then `malapert`, `cabeus`) | P6 | `pipeline/regions.json`, data |
| W1 ★ | P0 | Data loader, stereographic map with hillshade and cells, colour by metric, selection | T0 | `web/src/services/` (load, projection), `components/astraea/` (map) |
| W2 | P0 | MCDA engine, sliders, hard filters, presets | W1 | `services/mcda`, `components/astraea/` (controls), `components/artemis/` (presets) |
| W3 | P0 | Inspector: metrics, horizon chart with Sun/Earth tracks | W1 | `components/astraea/` (inspector), `services/ephemeris` |
| W4 ★ | P0 | Custom date range: worker recompute, parity tests, DSN windows | W3, P3 | `services/worker`, `services/dsn`, `components/artemis/` (dates) |
| W5 | P1 | Base ↔ ice, battery estimate, A/B comparator | W2 | `components/artemis/` |
| W6 | P1 | Detail patch switching on zoom | W1, P7 | `components/astraea/` (map) |
| W7 | P2 | APOLLO page: rendered docs, module cards, metric links | W1 | `components/apollo/` |
| A1 | P1 | `README.md`, `docs/outreach_guide.md` (module myths restored from the planning conversation), credits | T0 | `README.md`, `docs/outreach_guide.md` |
| V3 | P2 | Scientific validation of §11 and write-up | P6 | `docs/validation.md` |
| X1 | P2 | Playwright smoke test | W2 | `web/tests/` |

Suggested order with two workers: T0 → (P1 ∥ W1) → (P2 ∥ W2) → (P3 ∥ W3) → (P4 ∥ W4) → P6 → then P1-priority items.

---

## 13. Definition of done (demonstrator)

1. `pnpm --dir web dev` shows the precomputed baseline scenario immediately, with no Python step and no blocking external request.
2. Moving a weight slider updates all overview cells in under 100 ms.
3. `python -m pipeline.selene_build` accepts region, resolution and date arguments and regenerates the artefacts; `--synthetic` works with no downloaded data.
4. Choosing a custom date range recomputes sunlight and Earth-link metrics in the browser and updates scores, the inspector and DSN windows, with the fidelity note visible.
5. No rendering artefacts at 90°S or along longitude ±180°, and no WebGL errors.
6. Every metric on screen is traceable to its formula and NASA source in the documentation.
7. The baseline scenario is built from real LOLA data, and the manifest lists every source with checksum.
8. All tests of §11 marked required pass; parity between pipeline and browser holds.

---

## 14. Deferred, not forgotten

* **Global mode:** any region of the Moon. Needs a global DEM and global temperature products, a region parameter end to end (already in the CLI and manifest), the 3D globe view, and the LROC Lunar Pits catalogue (lava-tube skylights in the maria, e.g. Marius Hills).
* **Historical validation on Apollo sites** (Apollo 11, Mare Tranquillitatis) as an outreach comparison between equatorial and polar landings; depends on global mode.
* **Antenna sizing / link budget** for ARTEMIS.
* **Least-cost traverse route** between base and ice over the H3 graph (v1 shows distance and steepest cell on the straight line).
* **Multi-year illumination** (the 18.6-year cycle) and true PSR computation.
* **Resolution 8 patches, 0.5° azimuth step, 20 m or 5 m slopes** on the workstation.
* **Additional ground networks** (ESA ESTRACK, Goonhilly, KSAT).
* **Regolith cover viability** (needs a regolith-depth dataset).
* **Spanish UI** (i18n).

---

## 15. Working agreement for agents

* **Source of truth:** this file. If a task seems to require contradicting it, stop and report; do not improvise physics.
* **One task = one row of §12.** Touch only what the row owns. Shared surfaces (the data contract, `kpiConfig.ts`, direction geometry) change only through their owning task or with the orchestrator's explicit approval.
* **Git:** trunk is `main`; work on `feat/<TASK-ID>-slug` in a worktree; Conventional Commits with an `Agent: <model-id>` trailer; the orchestrator merges with `--no-ff` after review. Local commits only: nobody pushes to a remote until the human says so.
* **Tests** come with the code. Run `ruff check`, `pytest`, `pnpm --dir web typecheck`, `lint` and `test` as relevant before handing off.
* **Never fake** an external input silently. Missing data, credentials or tools are reported as blocked and added to `HUMAN_ACTION.md` by the orchestrator.
* **Decisions:** any choice not settled here that affects results, scope or the user's experience is appended to `HUMAN_ACTION.md` (decision log) by the orchestrator.
* **Security:** `WARNING.md` holds the latest vulnerability scan of the toolchain and dependencies (agent `security-auditor`). It is refreshed at the start of a session, after any dependency change and before every push. Do not add or upgrade a dependency that WARNING.md flags; pin exact versions in lockfiles.
* **Hand-off format** (final message of every worker):

  ```text
  TASK: <ID>  STATUS: done | blocked | partial
  BRANCH: feat/<ID>-slug @ <sha>
  CHANGED: <files>
  TESTS: <commands run and results>
  DECISIONS: <choices made that the plan did not settle>
  SKIPPED / DEVIATIONS: <anything not done, every `shortcut:` comment left>
  NEEDS HUMAN: <or "none">
  ```
