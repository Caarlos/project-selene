# Code Review: Lunar Physics Pipeline (PLAN.md Sections 5 & 6)

## 1. Concrete Defects

No concrete defects were found. The implementation across the Python pipeline and TypeScript web services strictly adheres to the physics specification, mathematical conventions, and binary data contract laid out in `PLAN.md`.

| Severity | File and Line | What is wrong | Why | Suggested fix |
|---|---|---|---|---|
| — | — | None | No defects identified | N/A |

---

## 2. Items Checked and Found Correct

### 2.1 Polar Stereographic Projection and Inverse
* **Axes and Orientation (`pipeline/hyperion/geometry.py:12-24`, `web/src/services/projection.ts:11-21`):**
  * Longitude 0° points along $+y$ (up) and 90°E points along $+x$ (right): `x = rho * sin(lon)`, `y = rho * cos(lon)`.
  * The inverse `lon = atan2(x, y)` in both Python (`geometry.py:22`) and TypeScript (`projection.ts:19`) correctly measures angles clockwise from $+y$.
  * Colatitude calculation $\rho = 2R \tan((90^\circ + \phi)/2)$ accurately represents south-polar stereographic projection with true scale at the south pole ($\phi = -90^\circ \implies \rho = 0$).
* **Raster Affine Coordinates & Row Direction (`pipeline/hyperion/geometry.py:31-41`):**
  * `row = (transform.f - y_m) / transform.a - 0.5`: row index increases downward as $y$ decreases.
  * `col = (x_m - transform.c) / transform.a - 0.5`: col index increases rightward as $x$ increases.
  * Integer coordinates correspond strictly to pixel centres, matching PLAN.md section 5.
* **Ray Tracer Cartesian Mapping (`pipeline/hyperion/horizon.py:37-38`):**
  * Moon-fixed unit vector components have $q_x$ along Lon 0° and $q_y$ along Lon 90°E.
  * The stereographic projection in the horizon ray tracer correctly maps projection coordinates to $x_{\text{proj}} = f \cdot q_y$ and $y_{\text{proj}} = f \cdot q_x$, yielding pixel lookups `row = (y_top - f * qx) / px - 0.5` and `col = (f * qy - x_left) / px - 0.5`.

### 2.2 Azimuth Convention and Module Consistency
* **Ray Tracer Azimuth (`pipeline/hyperion/horizon.py:28-30`):**
  * The tangent vector $t = n \cos A + e \sin A$ evaluates to local North at $A = 0^\circ$ and local East at $A = 90^\circ$ (clockwise from local North).
* **Ephemeris Azimuth (`pipeline/hermes/directions.py:20, 54-56`):**
  * Evaluated as $\operatorname{atan2}(d \cdot e, d \cdot n)$ normalized to $[0^\circ, 360^\circ)$. At local North ($d \cdot e = 0, d \cdot n > 0$), $A = 0^\circ$; at local East ($d \cdot e > 0, d \cdot n = 0$), $A = 90^\circ$.
  * The ray tracer and ephemeris direction kernels are in complete agreement on azimuth conventions.

### 2.3 Angular Units: Degrees versus Radians
* All trigonometric functions in NumPy, standard math, and JavaScript correctly receive angles in radians.
* Ingestion from JPL Horizons and export of azimuths, elevations, and horizon profiles consistently convert to degrees where specified (e.g., `_az_el`, `az_el_numba`, `trace_horizons`, `sky_view_factor`).
* Haversine distance in `web/src/services/projection.ts:24-30` explicitly scales input degrees by `RAD = Math.PI / 180`.

### 2.4 Elevation Formula and Observer Height
* **Elevation Formula (`pipeline/hyperion/horizon.py:43-46`):**
  * Evaluates $\tan(\text{el}) = (r_1 \cos s - r_0) / (r_1 \sin s)$. Because $r_1 \sin s > 0$ for all ray distances $s \in (0, 150\text{ km} / R)$, $\tan(\text{el})$ is strictly monotonically increasing with $\text{el} = \operatorname{atan2}(r_1 \cos s - r_0, r_1 \sin s)$. Maximizing $\tan(\text{el})$ along the ray and taking $\operatorname{atan}(\text{best})$ is mathematically exact and avoids redundant inverse trigonometric evaluations.
* **Observer Height (`pipeline/hyperion/horizon.py:79`):**
  * Observer radius is $r_0 = R_M + h_0 + \text{observer\_height\_m}$, defaulting to $2.0\text{ m}$ per PLAN.md D-04.

### 2.5 Step Table
* **Ray Stepping (`pipeline/hyperion/horizon.py:14-19`):**
  * Starts at $d = \text{pixel\_size\_m}$ (120 m), avoiding the singular point $s = 0$ where the observer stands.
  * Steps grow by $\max(\text{pixel\_size\_m}, 0.004 \cdot d)$ up to $\text{range\_m}$ ($150\text{ km}$), precisely matching PLAN.md section 5.1.

### 2.6 Bilinear Sampling and Half-Pixel Alignment
* **Sampling Index Order (`pipeline/hyperion/dem.py:28-41`):**
  * `bilinear(heights, row, col)` accesses `heights[r0, c0]`, maintaining strict `(row, col)` indexing.
  * Clamping and integer offsets `r0 = min(int(row), n_rows - 2)`, `fr = row - r0` correctly interpolate within pixel-centre lattices and return `NaN` outside.
  * Coordinate transformations (`xy_to_pixel` and `pixel_to_xy`) correctly add/subtract the $0.5$ half-pixel offset between corner coordinates and centre coordinates.

### 2.7 Pole and Antimeridian Boundary Behaviour
* **Exact South Pole (`lat = -90.0`):**
  * `latlon_to_xy(-90.0, lon)` yields `(0.0, 0.0)` for any longitude.
  * `xy_to_latlon(0.0, 0.0)` returns `(-90.0, 0.0)`.
  * `local_frame(-90.0, lon)` produces an exact right-handed orthonormal basis where `east x north = up = (0, 0, -1)`.
  * Stereographic projection denominator $1.0 - q_z$ evaluates to $2.0$ at the pole ($q_z = -1$), never vanishing.
* **Antimeridian ($\pm 180^\circ$):**
  * Longitudes are strictly normalized to $(-180^\circ, 180^\circ]$ via `np.where(lon == -180.0, 180.0, lon)` and `wrap_lon_deg` in Python, and `lon <= -180 ? lon + 360 : lon` in TypeScript.

### 2.8 Earth Parallax Formula
* `pipeline/hermes/directions.py:33-36` and `pipeline/hermes/link.py:24-36`:
  * Evaluates $d = D \cdot \hat{u}_{\text{Earth}} - r \cdot \hat{p}$ with $r = (R_M + h)/1000\text{ km}$ and $D$ in km.
  * Correctly accounts for up to $0.26^\circ$ topocentric parallax across the lunar surface.

### 2.9 Lit-Fraction & 360° Horizon Wrap
* **Lit Fraction (`pipeline/eos/sunlight.py:16-19, 55-56`):**
  * Evaluates $\operatorname{clamp}((\text{el}_\odot + \rho - H(A_\odot)) / (2\rho), 0, 1)$ with solar angular radius $\rho = 0.266^\circ$.
* **Horizon Wrap (`pipeline/hermes/directions.py:61-68`):**
  * Linear interpolation wraps circular azimuths seamlessly from $359^\circ$ to $0^\circ$ using modulo arithmetic `(i0 + 1) % n`.

### 2.10 Longest-Run Logic
* `pipeline/eos/sunlight.py:21-35, 58-72` and `pipeline/hermes/link.py:38-54`:
  * Accurately tracks maximal consecutive steps of $f = 0$ (darkness / outage).
  * Flagging for boundary truncation (`run_touch`) correctly detects whether the maximal run touches the start or end of the time series, including multi-run ties where only one maximal run touches an endpoint.

### 2.11 H3 Scaling to Lunar Radius
* Purely spherical indexing per PLAN.md D-01:
  * Areas in `pipeline/hyperion/grid.py:94` use `h3.cell_area(c, unit="rads^2") * R_M**2`, scaling unit sphere solid angles directly by the lunar radius squared.
  * Surface distances in `web/src/services/projection.ts:29` utilize the lunar radius $R_M = 1,737,400\text{ m}$.

### 2.12 Endianness and Binary File Layout
* **Ephemeris (`ephemeris_2026_2036.bin`):**
  * Python writes `<f4` (little-endian Float32), $n \times 5$ values per row: `[sun_lon, sun_lat, earth_lon, earth_lat, earth_dist_km]`.
  * TypeScript reads `<f4` with `decodeEphemeris` into `Float32Array`, checking byte lengths and handling architecture endianness.
* **Horizons (`horizons_<grid>.bin`):**
  * Python writes `<i2` (little-endian Int16 centi-degrees, $0.01^\circ$).
  * TypeScript reads `<i2` with `decodeHorizons` into `Int16Array`, mapping 360 azimuth columns per cell row.

---

## 3. Items Not Judged Without Running Code

1. **JPL Horizons Live Ingestion Throughput and Network Resilience:**
   * `pipeline/hermes/ephemeris.py:fetch_chunk` queries the live SSD JPL Horizons REST API. Network latency, socket timeouts, rate limits, and server response structure over 10-year runs cannot be verified from source alone.
2. **Numba OpenMP / Threading Scalability:**
   * The parallel performance and thread safety of `@njit(parallel=True)` across various CPU architectures in `pipeline/hyperion/horizon.py` (`_trace`) and `pipeline/eos/sunlight.py` (`_sun_kernel`).
3. **Floating-Point Parity Across Runtimes:**
   * Potential sub-ulp discrepancies between Python 3.12 (libm / glibc) and browser JavaScript V8 engine math (e.g. `Math.hypot` and `Math.atan2`) across diverse client hardware.
4. **WebGL 2 Software Fallback (SwiftShader) Rendering Budgets:**
   * Memory limits and rasterization latencies when uploading 14,444 polygon cell vertices to deck.gl `PolygonLayer` in headless testing environments.
