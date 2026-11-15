# SELENE: Selenographic Exploration & Lunar Environment Navigation Engine

SELENE is an interactive, scientifically defensible web platform designed to evaluate, compare, and select landing and base sites at the lunar south pole (80°S–90°S). Developed for the NASA Space Apps Challenge 2026 challenge "Lunar Landing Site Navigator", the system bridges high-precision planetary science and real-time mission decision analysis. By decoupling heavy offline physical computations—spherical ray tracing over high-resolution elevation models, solar and Earth ephemeris tracking with physical libration, thermal ice stability modeling, and slope hazard analysis—from an entirely static client-side web application, SELENE empowers mission planners, scientists, and the public to interactively balance critical exploration trade-offs across thousands of lunar-scaled hexagonal sites.

## Modules

SELENE coordinates eight specialized subordinate modules, each pairing an aerospace-style backronym with a Greco-Roman deity whose mythological attributes reflect its engineering role:

| Module | Backronym | Role |
|---|---|---|
| **SELENE** (core) | Selenographic Exploration & Lunar Environment Navigation Engine | System orchestrator: lunar H3 grid standard, schema data contracts, pipeline build CLI, and web application state. |
| **HYPERION** | High-resolution Yield, Polar Elevation & Relief Indexing Observation Network | Topographic foundation: LOLA DEM ingestion, lunar H3 tessellation, sample point selection, 360° horizon ray tracing out to 150 km, sky view factor (SVF), and hillshade relief generation. |
| **EOS** | Ephemeris & Orbital Sunlight Simulator | Illumination modeling: solar ephemeris vector tracking, solar disc crossing (0.266° radius), sunlight percentage, and longest continuous darkness duration. |
| **HESTIA** | Hydration, Environmental Stability & Thermal Ice Assessment | Volatiles and thermal environment: LOLA permanently shadowed region (PSR) mapping, Diviner surface temperature sampling, thermal amplitude, and water-ice thermal stability index (peak temperature < 110 K). |
| **ARGUS** | Azimuthal Roughness, Gradient & Unobstructed-landing Surveyor | Terrain safety and shielding: slope distribution (mean and 95th percentile), safe landing fraction (< 10° slope), Terrain Ruggedness Index (TRI), and topographic radiation/micrometeoroid shielding. |
| **HERMES** | Hexagonal Earth-Relay & Mission Ephemeris System | Communications: Direct-to-Earth (DTE) line-of-sight tracking accounting for lunar libration (about ±7°), Earth outage durations, and Deep Space Network (DSN) ground station visibility (Madrid, Goldstone, Canberra). |
| **ASTRAEA** | Adaptive Site-selection & Terrain Risk Analysis Exploration App | Web visualizer and decision engine: flat south-polar stereographic map, real-time Multi-Criteria Decision Analysis (MCDA) weight engine (< 100 ms response), hard safety filters, and cell inspector with 360° horizon chart. |
| **ARTEMIS** | Adaptive Reconnaissance & Targeted Exploration Mission Integration System | Mission operations layer: preconfigured mission presets (Artemis III, CLPS, Base Camp), base-to-ice traverse distance and steepest slope, battery sizing estimator, A/B candidate site comparator, and custom date selector. |
| **APOLLO** | Accessible Platform for Open Lunar Learning & Outreach | Knowledge and outreach: interactive documentation portal, physical formulas, NASA data lineage, educational outreach guides, and scientific validation reports. |

## How It Works

SELENE separates heavy computational physics from lightweight, responsive user exploration through a strict, versioned data contract:

1. **Offline Physics Pipeline (Python):** The pipeline runs offline, reading raw digital elevation models, thermal data, and orbital ephemerides. It tessellates the polar cap into an H3 hexagonal grid scaled to the Moon's radius (R = 1,737.4 km). For every cell, it traces 360 horizon rays out to 150 km over the true lunar sphere to determine local terrain skylines, samples surface slope and roughness, evaluates thermal ice stability, and calculates hourly solar illumination and Earth visibility across an ephemeris timeline.
2. **Standardized Data Contract:** Pipeline outputs are serialized into compact, schema-validated static artifacts (`web/public/data/<scenario_id>/`), including `manifest.json`, columnar metric arrays (`cells_cap_r5.json`), little-endian binary horizon tables (`horizons_cap_r5.bin`), packed ephemeris tables (`ephemeris_2026_2036.bin`), and a WebP hillshade basemap.
3. **Static Web Application (Browser):** A fully static web application built with React, TypeScript, deck.gl, and Vite runs completely inside the user's browser with zero server-side computation. It loads precalculated artifacts instantly, projects hexagonal outlines on the fly directly from H3 indices, normalizes physical metrics into standardized 0–1 Key Performance Indicators (KPIs), executes live weighted multi-criteria scoring in real time, and uses a dedicated Web Worker to dynamically recompute sunlight and Earth visibility windows for any user-selected date range.

## What the Demonstrator Is Designed to Show

The list below is the designed feature set. Build status and priorities are in PLAN.md section 12; some items may not be finished in the first version.

* **Interactive Polar Map:** A flat south-polar stereographic projection (deck.gl) centered on 90°S over LOLA shaded relief, rendering 14,444 H3 resolution-5 hexagonal cells across 80°S to 90°S without polar singularities or antimeridian seam artifacts.
* **Real-Time MCDA Engine:** Reactive weight sliders for five core criteria (sunlight, Earth communications, safe terrain, ice proximity, and topographic protection) along with hard threshold filters (slope limit, maximum dark hours, minimum Earth visibility) that dynamically re-score and recolor all 14,444 cells in under 100 milliseconds.
* **Detailed Cell Inspector:** Deep-dive analysis for any selected hexagon, displaying raw physical quantities with units (elevation, mean and best-point sunlight %, maximum continuous darkness hours, Earth visibility %, communications outage hours, slope metrics, TRI roughness, Diviner peak and average temperatures, thermal swing, PSR fraction, ice stability index, and Sky View Factor) alongside an interactive 360° ECharts horizon profile chart plotting Sun and Earth trajectories against local topography.
* **ARTEMIS Mission Presets:** One-click configurations inspired by three mission types (weights are this project's own assumptions, not NASA requirements):
  * *Artemis III (crewed sortie):* prioritizes gentle slopes, strong Earth links, and sunlight for landing safety and communications.
  * *CLPS (robotic prospecting rover):* maximizes water-ice stability and accepts steeper terrain.
  * *Base Camp (permanent habitat):* balances illumination, battery survival constraints, communications, and ice access.
* **Traverse and Logistics Planning:** Automatic calculation of geodesic surface distance and steepest intervening slope from any selected base site to the nearest water-ice deposit (`ice_index` >= 0.2), together with indicative battery storage sizing based on worst-case continuous darkness hours.
* **A/B Candidate Comparator:** Multi-site comparison tool allowing planners to pin up to three candidate cells side-by-side to evaluate competing physical metrics and MCDA scores.
* **Custom Date Range Simulation:** Interactive date picker powered by a background Web Worker that re-evaluates solar disc illumination and Earth line-of-sight against stored cell horizons for any timeline between 2026 and 2036, synchronized with real-time Deep Space Network (DSN) ground station visibility timelines (Madrid, Goldstone, Canberra).
* **High-Resolution Detail Patches:** Seamless zoom-level switching from regional overview (H3 resolution 5) to fine-scale resolution 7 (0.38 km² cells, ~380 m edge length) over high-priority exploration targets: Shackleton crater ridge, Malapert massif, and Cabeus crater floor.
* **Integrated Knowledge Base:** Direct in-app access to technical documentation, formulas, and NASA data sources via the APOLLO module.

## Data Credits

Project SELENE uses public-domain planetary datasets published by NASA and its instrument teams:

* **NASA LRO LOLA (Lunar Orbiter Laser Altimeter):**
  * Polar digital elevation models: `ldem_75s_120m.img` and `ldem_75s_120m.lbl` (120 m/px, 75°S–90°S) and `ldem_80s_20m.jp2` (20 m/px, 80°S–90°S, with `ldem_80s_80m.jp2` fallback) from the NASA Planetary Data System (PDS) Geosciences Node at Washington University in St. Louis.
  * Permanently Shadowed Regions map: `LPSR_75S_120M_201608.TIF` from NASA Goddard Space Flight Center Planetary Geodynamics Data Archive (PGDA).
  * Multi-year illumination and Earth visibility validation maps: `AVGVISIB_75S_120M_201608.TIF` and `AVGVISIB_75S_120M_201608_EARTH.TIF` (Mazarico et al., 2011).
* **NASA LRO Diviner (Diviner Lunar Radiometer Experiment):**
  * Polar surface thermal models: Diviner Polar Resource Product (`dlre_prp_south.zip`, Paige et al., 2010), providing annual maximum temperature (`temp_max_K`) and annual average temperature (`temp_avg_K`) at approximately 507 m resolution, from the NASA PDS Geosciences Node.
* **NASA JPL Horizons:**
  * High-precision lunar ephemeris: hourly solar and Earth direction vectors, sub-solar points, sub-Earth points, and Earth–Moon center distances (DE441 ephemeris, target `301`, observer center `500@399`, quantities `14,15,20`) generated via the NASA JPL Horizons system.

## Deferred Features

As specified in `PLAN.md` Section 14, the following capabilities are planned for future iterations beyond the initial demonstrator:

* **Global Mode:** Extension to any lunar region beyond the south polar cap, utilizing global DEMs, global temperature datasets, end-to-end region parameterization, a 3D globe view, and the LROC Lunar Pits catalog of collapse skylights in the volcanic maria (e.g., Marius Hills).
* **Historical Apollo Validation:** Comparative analysis on equatorial Apollo landing sites (e.g., Apollo 11 at Mare Tranquillitatis) to illustrate environmental differences between equatorial sorties and polar outposts.
* **Antenna Sizing and Link Budgets:** Detailed RF link budget and antenna diameter sizing calculations for ARTEMIS.
* **Least-Cost Traverse Routing:** Optimal graph-based traverse pathfinding over the H3 hexagonal mesh connecting bases and ice deposits (the initial demonstrator provides great-circle distance and steepest intervening cell slope).
* **Multi-Year Illumination Modeling:** Simulation across the complete 18.6-year lunar precession cycle and rigorous long-term PSR derivation.
* **Workstation High-Fidelity Patches:** Generation of H3 resolution-8 patches, 0.5° azimuth ray-tracing steps, and 5–20 m slope baselines on dedicated workstation hardware.
* **Additional Ground Station Networks:** Incorporation of ESA ESTRACK, Goonhilly Earth Station, and KSAT ground tracking networks into communication modeling.
* **Regolith Cover Viability:** Quantitative regolith shielding assessments using future high-resolution regolith depth datasets.
* **Internationalization:** Multi-language user interface support, beginning with Spanish.

## Documentation

* [PLAN.md](PLAN.md): Complete architecture specification, technical decisions, physics equations, data contract schemas, and development guidelines.
* [docs/TECHNICAL_PRIMER.md](docs/TECHNICAL_PRIMER.md): Non-specialist guide explaining lunar geometry, horizon ray tracing, ephemeris calculations, and key architectural choices.
* [docs/outreach_guide.md](docs/outreach_guide.md): Educational outreach guide detailing the lunar south pole environment, the Apollo-to-Artemis story, the mythological roots of each module, and mission planning trade-offs.
* [HUMAN_ACTION.md](HUMAN_ACTION.md): Checklist of actions reserved for the human project owner and the record of design decisions taken during development.
* [WARNING.md](WARNING.md): Toolchain security scans, dependency audits, and vulnerability mitigation records.

## Running the application

The web app is a static site. All the data it needs (the real `south-pole-2027` scenario and a synthetic `fixture` scenario) is already committed under `web/public/data/`, so you do **not** need Python or the NASA downloads just to look at it.

### 1. What you need

* Node.js 24.22.3 (the version is pinned in `.nvmrc`). pnpm 12.18.0 comes with it through `corepack`.
* A browser with WebGL (any current Chrome, Edge or Firefox).

### 2. Start it

Open a terminal in the repository folder (in VS Code: *Terminal → New Terminal*) and run these lines one at a time:

```sh
nvm use                                          # switches this terminal to Node 24.22.3
node -v                                          # must print v24.22.3
corepack pnpm --dir web install --frozen-lockfile   # first time only; installs the libraries
corepack pnpm --dir web dev                      # starts the app
```

The last command keeps running and prints `Local: http://127.0.0.1:5173/`. Leave that terminal open.

### 3. Open it

* **Working on the same computer:** open <http://127.0.0.1:5173/> in your browser.
* **Working on a remote server through VS Code (Remote-SSH):** the app only listens on the server itself, on purpose. VS Code forwards the port for you: open the *Ports* panel (next to *Terminal*), check that port `5173` is listed (use *Forward a Port* and type `5173` if it is not), then click the globe icon on that row or open <http://localhost:5173/> on your own computer.

The first load downloads about 13 MB of data and takes a few seconds. The header shows the scenario name and `14,444` cells when it is ready.

### 4. Choose the scenario

| Address | What it shows |
|---|---|
| `http://localhost:5173/` | Real NASA data, whole of 2027 (`south-pole-2027`, the default) |
| `http://localhost:5173/?scenario=fixture` | Synthetic terrain used for tests; not real, labelled as synthetic |

### 5. Stop it

Click on the terminal that is running the app and press `Ctrl + C`.

### If something goes wrong

| Symptom | Cause and fix |
|---|---|
| `nvm: command not found` or `node -v` prints another version | Run `export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH` in that terminal, then repeat step 2. |
| `Port 5173 is already in use` | The app is already running in another terminal. Use that one, or stop it with `Ctrl + C` first. |
| The page does not open from a remote server | The port is not forwarded; see step 3. |
| "Could not load scenario data" | The message names the missing file. Check that `web/public/data/` is complete (`git status` should show no deleted files). |
| Grey page with panels but no map | WebGL is disabled in the browser. Try another browser or enable hardware acceleration. |

### Checking the production build (optional)

This is the version that would be uploaded to a static host:

```sh
corepack pnpm --dir web build      # writes web/dist/
corepack pnpm --dir web preview    # serves it at http://127.0.0.1:4173/
```

## Developing

Needs Python 3.12+ as well as the Node setup above.

```sh
# pipeline: install, check, test
python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r requirements.lock -e '.[dev]'
.venv/bin/ruff check .
.venv/bin/pytest

# web app: checks
corepack pnpm --dir web typecheck
corepack pnpm --dir web lint
corepack pnpm --dir web test
```

### Rebuilding the data (optional, slow)

Only needed to change the scenario (dates, region, parameters). The NASA inputs are about 400 MB and are not in the repository.

```sh
.venv/bin/python -m pipeline.fetch_data --download              # NASA files into data/raw/
.venv/bin/python -m pipeline.selene_build --scenario-id south-pole-2027   # about 24 min on 2 cores
.venv/bin/python -m pipeline.validation_report                  # comparison with NASA maps
.venv/bin/python -m pipeline.fixture                            # regenerates the synthetic scenario
```

`python -m pipeline.selene_build --help` lists every option. Each build is checked against the data contract and added to `web/public/data/index.json`; the first entry of that file is the scenario the app opens by default.
