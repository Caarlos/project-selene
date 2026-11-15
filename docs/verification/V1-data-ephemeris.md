> **Correction (2026-11-15):** the converter in this spike (`diviner_prp_to_geotiff.py`) wrote the Diviner grid transposed (x and y swapped). It was found by checking against the LOLA shadow mask (agreement 0.19 as written, 0.88 after the fix). The corrected converter is `pipeline/hestia/ice.py` (`prp_zip_to_geotiff`); `data/raw/diviner_prp_south_500m.tif` was regenerated. Do not use the spike script.

# Verification V1-data-ephemeris

Run date: 2026-11-14. Spikes and logs: `spikes/V1-data-ephemeris/`. Downloads: `data/raw/` (551 MB).

All five claims hold except one part of C: Diviner temperatures are published as ASCII tables, not rasters. A 40-line converter turns the one needed table into a GeoTIFF, and that is tested.

## Verdicts

| Claim | Verdict | Evidence | Exact names, versions, sizes |
|---|---|---|---|
| A. LOLA south-polar stereographic DEM, at least 75°S, 60–240 m/px, under 2 GB RAM | VERIFIED | PDS directory listing; `open_rasters.py` → `open_rasters.log` | `ldem_75s_120m.img` + `.lbl`, 116,250,752 bytes, 7624 × 7624 int16, downloaded and opened (peak 540 MB RSS including a full read) |
| B. Finer LOLA DEM for 80°S–90°S at 20–80 m/px | VERIFIED | PDS and PGDA listings, HTTP HEAD; `jp2_remote_window.py` → `jp2_remote_window.log` | 20, 40 and 80 m all exist in three encodings (table below). 20 m JP2 is 267,689,172 bytes |
| C1. Diviner max/avg temperature as downloadable rasters | REFUTED as stated; working alternative tested | PDS Diviner derived bundle listing; `diviner_prp_to_geotiff.py` → `.log` | Only ASCII tables. `dlre_prp_south.zip` (116,583,332 bytes) converts to a 1200 × 1200, 506.675 m GeoTIFF |
| C2. LOLA PSR maps as rasters or shapefiles | VERIFIED | PGDA products 69 and 90; `open_rasters.log` | `LPSR_75S_120M_201608.TIF` (1.0 MB), `LPSR_80S_20MPP_ADJ.TIF` (154 MB), shapefile `LPSR_80S_20MPP_ADJ_1km2.*` (20.7 MB, 1531 polygons) |
| C3. LOLA average illumination and Earth visibility maps | VERIFIED | PGDA product 69; `open_rasters.log` | `AVGVISIB_75S_120M_201608.TIF` (83.1 MB), `AVGVISIB_75S_120M_201608_EARTH.TIF` (43.1 MB) |
| D. One Horizons query gives sub-Earth, sub-solar and range hourly | VERIFIED | `fetch_ephemeris.py`, `horizons_sample_2027-01-01_08.txt`, `limit_test_11y_response.txt` | API version 1.2, ephemeris DE441, frame MOON_ME. 87,648 rows for 2026–2036 fetched in 23 s |
| E. `astronomy-engine` reproduces both points to better than 0.1° | VERIFIED | `node/compare.ts` → `node/compare_2027.log`, `node/compare_2026_2036.log` | astronomy-engine 2.1.19. Worst error 0.0091° over 87,648 hourly steps |

One-line facts:
- Free disk after downloads: 12,297 MB (it was about 15 GB at the start; the other verifier was also writing).
- Peak RAM observed: 953 MB RSS (the Diviner table conversion). Raster opening peaked at 540 MB, the remote JP2 window at 514 MB, the ephemeris fetch at 56 MB.

## A. Horizon DEM

Archive: `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/` with subfolders `img/` (int16 + `.lbl`), `jp2/` (int16 JPEG2000 + `_jp2.lbl`; losslessness not checked), `float_img/` (float32). Data set id `LRO-L-LOLA-4-GDR-V1.0`, product version V2.0, created 2017-06-15.

South-polar products that exist (bytes):

| Product | Coverage | m/px | Pixels | `.img` | `.jp2` |
|---|---|---|---|---|---|
| ldem_45s_400m / 200m / 100m | 45°S–90°S | 400 / 200 / 100 | | 103,680,000 / 414,720,000 / 1,658,880,000 | 43,124,560 / 134,118,606 / 393,679,678 |
| ldem_60s_240m | 60°S–90°S | 240 | 7760² | 120,435,200 | 43,435,022 |
| ldem_60s_120m | 60°S–90°S | 120 | 15520² | 481,740,800 | 132,441,860 |
| ldem_60s_60m | 60°S–90°S | 60 | | 1,926,963,200 | 385,729,140 |
| ldem_75s_240m | 75°S–90°S | 240 | 3812² | 29,062,688 | 10,766,928 |
| **ldem_75s_120m** | 75°S–90°S | 120 | 7624² | **116,250,752** | 33,948,010 |
| ldem_75s_60m | 75°S–90°S | 60 | 15248² | 465,003,008 | 103,313,776 |
| ldem_75s_30m | 75°S–90°S | 30 | | 1,860,012,032 | 299,122,509 |

The recalled name `LDEM_80S_80M` exists but covers only 80°S, so it is a slope candidate, not a horizon candidate.

NASA PGDA also has a newer set (Barker et al. 2023, product 90, `https://pgda.gsfc.nasa.gov/products/90`), float32 cloud-optimised GeoTIFF in metres: `LDEM_60S_240MPP_ADJ.TIF` (218,961,039 bytes), `LDEM_60S_120MPP_ADJ.TIF` (821,504,895), `LDEM_60S_60MPP_ADJ.TIF` (3.09 GB), `LDEM_75S_30MPP_ADJ.TIF` (2.80 GB).

**Recommendation: `ldem_75s_120m.img` with `ldem_75s_120m.lbl`.** Downloaded to `data/raw/`.

What rasterio 1.5.2 (GDAL 3.12.2) reports when opening the `.lbl` (driver `PDS`):

- Shape 7624 rows × 7624 cols, 1 band, `int16` little-endian, no header bytes in the `.img`.
- CRS: `+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m`. Sphere, true scale at the pole, planetocentric, frame "MEAN EARTH/POLAR AXIS OF DE421".
- Pixel size 120 m. Transform `(120, 0, -457440, 0, -120, 457440)`. Bounds ±457,440 m.
- Height in metres = DN × 0.5. Radius in metres = 1,737,400 + DN × 0.5. rasterio exposes `scales = (0.5,)` and `offsets = (1737400.0,)`, so applying both gives radius, not height.
- Reference radius 1737.4 km, confirmed in the label.
- Nodata: GDAL reports −32768, the label defines none, and the file contains zero such pixels.
- Range: −7763.0 m to +7025.0 m.
- South pole: it sits exactly on the corner shared by rows 3811/3812 and cols 3811/3812. Those four pixels are 1303.5, 1284.5, 1301.5, 1278.0 m. `ds.index(0, 0)` returns (3812, 3812) = 1278.0 m.
- Cross-check: Shackleton floor at 89.67°S, 129.2°E reads −2788.5 m.

Pixel to map coordinates (0-based row, col, pixel centre):

```
x = (col - 3811.5) * 120        # metres, +x to the right
y = (3811.5 - row) * 120        # metres, +y up
lon = atan2(x, y)               # east-positive
lat = -90° + 2 * atan( hypot(x, y) / (2 * 1737400) )
```

Longitude 0° points up (+y, towards row 0). 90°E points right (+x). 180° points down. 90°W points left. Checked against PROJ through `rasterio.warp.transform` at four points; both agree to 1e-6°.

The edge mid-points are at 75.0008°S; the corners reach 68.9°S.

## B. Slope DEM

80°S–90°S products (all ±304 km, same projection as above):

| Product | m/px | Pixels | Size (bytes) | Source and encoding |
|---|---|---|---|---|
| ldem_80s_80m.img | 80 | 7600² | 115,520,000 | PDS, int16 raw, DN × 0.5 |
| ldem_80s_80m.jp2 | 80 | 7600² | 29,837,992 | PDS, JP2 (downloaded, opens) |
| ldem_80s_40m.img | 40 | 15200² | 462,080,000 | PDS, int16 raw |
| ldem_80s_40m.jp2 | 40 | 15200² | 91,722,831 | PDS, JP2 |
| ldem_80s_20m.img | 20 | 30400² | 1,848,320,000 | PDS, int16 raw |
| **ldem_80s_20m.jp2** | 20 | 30400² | **267,689,172** | PDS, JP2, 1024 × 1024 tiles |
| LDEM_80S_80MPP_ADJ.TIF | 80 | | 189,158,392 | PGDA 2023, float32 COG, metres |
| LDEM_80S_40MPP_ADJ.TIF | 40 | | 716,299,920 | PGDA 2023 |
| LDEM_80S_20MPP_ADJ.TIF | 20 | 30400² | 2,696,082,051 | PGDA 2023 |
| LDSM_80S_80MPP_ADJ.TIF | 80 | | 241,594,035 | PGDA ready-made slope, degrees |
| LDSM_80S_40MPP_ADJ.TIF | 40 | | 955,867,961 | PGDA slope |
| LDSM_80S_20MPP_ADJ.TIF | 20 | | 3,778,056,355 | PGDA slope |

Finer but smaller areas also exist: `ldem_85s_10m`, `ldem_875s_5m` (PDS), `LDEM_83S_10MPP_ADJ.TIF` (5.1 GB, PGDA). The `float_img/` versions are twice the `.img` sizes.

- **Finest that this machine can process: 20 m.** A full 30400² int16 array is 1.85 GB, so it must be read in windows. A 1024 × 1024 window is 2 MB.
- **With about 300 MB of download: `ldem_80s_20m.jp2` (267.7 MB).** A 1024 × 1024 window around the pole was read straight over HTTP in 94 s at 514 MB RSS; pole values 1292.5, 1287.5, 1292.5, 1289.0 m.
- JP2 files do not carry the 0.5 scale (rasterio shows scale 1.0, no nodata). Multiply DN by 0.5 by hand.
- If 2.7 GB may be downloaded, `LDEM_80S_20MPP_ADJ.TIF` is the better source: already in metres, deflate tiles, overviews, and it matches the PGDA PSR and slope products.
- Cheapest route to slope: `LDSM_80S_80MPP_ADJ.TIF` (241.6 MB) is slope in degrees, no computation needed.

## C. Temperature and shadow products

### C1. Diviner temperatures — no rasters; table converted

Bundle: `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/`.

| Product | What it is | Format | Size |
|---|---|---|---|
| Polar Resource Product, `data_derived_prp/dlre_prp_south.tab` (data set `LRO-L-DLRE-5-PRP-V2.0`, Paige et al. 2010) | Thermal-model annual average and annual maximum surface temperature (K) and ice depth (m), on 2,880,000 triangles | ASCII, 15 columns, 210-byte rows | 604,800,210 bytes; zipped copy `extras/prp/dlre_prp_south.zip` is 116,583,332 bytes |
| Polar Cumulative Products, `data_derived_pcp/` (Williams et al., 240 m) | Average bolometric temperature per local-time or sub-solar-longitude bin, summer/winter and six seasons | ASCII tables `pcp_avg_tbol_pols_*_240.tab`, columns x, y, clon, clat, ltim, tbol | 528 south-pole files of about 200–220 MB each |

The 240 m product is real but it is hundreds of per-bin tables with no single maximum map. Building T_max from it means downloading tens of GB. Not suitable for tomorrow.

The PRP gives T_max directly. Tested conversion (`diviner_prp_to_geotiff.py`):

- The mesh is a regular 1200 × 1200 grid in polar stereographic space; every pixel receives exactly two triangles.
- Output `data/raw/diviner_prp_south_500m.tif`: 3 bands (`temp_avg_K`, `temp_max_K`, `ice_depth_m`), float32, nodata −999, pixel 506.675 m, extent ±304,005 m, same CRS as the LOLA products. 12.4 MB. Reopens with rasterio.
- Ranges: temp_avg 25.1–212.8 K, temp_max 26.8–350.8 K. 3.9 % of pixels have temp_max below 110 K.
- Peak 953 MB RSS.

Limits of the PRP: it is a model fitted to the first year of Diviner data, on a Kaguya DEM, at about 500 m, covering 80°S only along the axes (corners reach 75.9°S). `ice_depth` uses −999 for "deeper than 2.87 m", 0 for "stable at the surface", and an undocumented −1 on 100,319 triangles; the converter averages these flags with real depths, so use `temp_max_K` and ignore band 3 unless that is fixed.

### C2. PSR maps

| File | URL | Format | Resolution, coverage | Size | Values |
|---|---|---|---|---|---|
| `LPSR_75S_120M_201608.TIF` | `https://pgda.gsfc.nasa.gov/data/MoonIllumination/` | GeoTIFF int16, grid identical to `ldem_75s_120m` | 120 m, 75°S–90°S | 1,046,706 | DN +20000 = permanent shadow, −20000 = not. Value = DN × 0.000025 + 0.5 |
| `LPSR_85S_060M_201608.TIF`, `LPSR_65S_240M_201608.TIF` | same folder | GeoTIFF | 60 m to 85°S; 240 m to 65°S | 656,183; 582,074 | same (not downloaded) |
| `LPSR_80S_20MPP_ADJ.TIF` | `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/` | GeoTIFF float32, 30400², 512 tiles, overviews | 20 m, 80°S–90°S | 154,221,202 | 0 or 1, nodata NaN |
| `LPSR_80S_20MPP_ADJ_1km2.SHP/.SHX/.DBF/.PRJ` | same folder | Polygon shapefile, 1531 PSRs larger than 1 km², fields gid, area_km2, name | 80°S–90°S | 20,743,300 (.SHP) | polar stereographic metres, R = 1,737,400 |
| `LPSR_80S_20MPP_ADJ.SHP` (all 506,349 PSRs) | same folder | Shapefile | | 154 MB + 117 MB DBF | not downloaded |

The 2016 files are also at `http://imbrium.mit.edu/EXTRAS/ILLUMINATION/` as `.IMG` + `.LBL` and `.JP2`.

### C3. Average illumination and Earth visibility (Mazarico et al. 2011)

| File | Meaning | Format | Size |
|---|---|---|---|
| `AVGVISIB_75S_120M_201608.TIF` | Fraction of hourly steps over 18.6 years with any part of the Sun's disc visible | GeoTIFF int16, 7624², 120 m, 75°S–90°S | 83,052,039 |
| `AVGVISIB_75S_120M_201608_EARTH.TIF` | Same for any part of the Earth's disc | same | 43,148,153 |
| `AVGVISIB_85S_060M_201608[_EARTH].TIF` | 60 m, 85°S–90°S | same | 33,994,464; 24,862,958 |
| `AVGVISIB_65S_240M_201608[_EARTH].TIF` | 240 m, 65°S–90°S | same | 60,394,652; 22,963,503 |

All from `https://pgda.gsfc.nasa.gov/data/MoonIllumination/`. Value = DN × 0.00004, so 0 to 1 (DN 0–25000); 0 means never. Nodata −32768. The 75°S grid is pixel-for-pixel the grid of `ldem_75s_120m`, so validation needs no resampling. The two 75°S files are downloaded and open.

The `_COG.TIF` links on the PGDA page are 3.8 KB stubs, not data. Use the plain `.TIF`.

## D. JPL Horizons ephemeris

Query (GET `https://ssd.jpl.nasa.gov/api/horizons.api`):

```
format=text  COMMAND='301'  OBJ_DATA='NO'  MAKE_EPHEM='YES'  EPHEM_TYPE='OBSERVER'
CENTER='500@399'  START_TIME='2027-01-01 00:00'  STOP_TIME='2027-01-08 00:00'
STEP_SIZE='1 h'  QUANTITIES='14,15,20'  ANG_FORMAT='DEG'  RANGE_UNITS='KM'
CSV_FORMAT='YES'  CAL_FORMAT='CAL'  TIME_DIGITS='MINUTES'
```

- Columns: `Date__(UT)__HR:MN`, two blank flag columns, `ObsSub-LON`, `ObsSub-LAT`, `SunSub-LON`, `SunSub-LAT`, `delta`, `deldot`.
- Units: degrees; `delta` in km only because `RANGE_UNITS='KM'` is set (default is au); `deldot` in km/s. Times are UTC.
- Longitude is east-positive, printed 0–360 for both points (the sub-Earth longitude appears as 358.7, not −1.3).
- Frame: header says `Target pole/equ : MOON_ME {East-longitude positive}`, radii 1737.4 km, source DE441. Physical libration is included. This is the same mean-Earth/polar-axis system as the LOLA products (theirs is the DE421 realisation; the difference is metres).
- Row limit: 90,000 per request. An 11-year hourly request is refused with "Output length exceeded, 93216 times requested, max. is 90000". The 10-year request returned 87,649 rows (stop time inclusive) in one call.
- 2026-01-01 to 2036-01-01 hourly is 87,648 rows with the end excluded, not 87,660.
- Chunking: none is strictly required for ten years. `fetch_ephemeris.py` asks one calendar year per request anyway (8,760 or 8,784 rows), which keeps any range safe.

Sanity checks on real output:

| Quantity | 2027 | 2026–2036 | Expected |
|---|---|---|---|
| Sub-Earth longitude | −7.77° to +7.68° | −8.05° to +8.08° | within about ±8° |
| Sub-Earth latitude | −6.83° to +6.85° | −6.86° to +6.86° | within about ±8° |
| Sub-solar latitude | −1.552° to +1.547° | −1.588° to +1.586° | within about ±1.6° |
| Sub-solar longitude | 360° per 29.529 days, decreasing (moving west) | | 29.53 days |
| Range | 357,288–406,603 km | 356,446–406,664 km | |

`spikes/V1-data-ephemeris/fetch_ephemeris.py` uses only the standard library (no `astroquery` needed):

```
python3 fetch_ephemeris.py 2026-01-01 2036-01-01 ephemeris.json
```

It writes `t0` (ISO UTC), `step_s`, `sun_lon_deg`, `sun_lat_deg`, `earth_lon_deg`, `earth_lat_deg`, `earth_dist_km`, plus a `frame` note. Longitudes stay 0–360 as Horizons prints them. It retries on network errors, stops if Horizons no longer reports MOON_ME, and asserts no time gaps and plausible ranges. The ten-year file is 4.4 MB (1.9 MB gzipped).

## E. Browser ephemeris with astronomy-engine 2.1.19

Compared against Horizons at every hourly step (the 20 printed samples are in `node/compare_2027.log`):

| Quantity | Max error, 2027 (8,760 steps) | Max error, 2026–2036 (87,648 steps) |
|---|---|---|
| Sub-solar longitude (from `RotationAxis`) | 0.0036° | 0.0046° |
| Sub-solar latitude | 0.0022° | 0.0035° |
| Sub-Earth longitude (from `RotationAxis`) | 0.0079° | 0.0091° |
| Sub-Earth latitude | 0.0026° | 0.0039° |
| `Libration().elon` as sub-Earth longitude | 0.0076° | 0.0079° |
| `Libration().elat` as sub-Earth latitude | 0.0276° | 0.0276° |
| Earth–Moon distance (`GeoMoon`) | 52.6 km | 52.6 km |

Everything is well inside 0.1°. `Libration()` works for the sub-Earth point with the same signs as Horizons, but the `RotationAxis` route is seven times better in latitude and gives both points from one function.

The function is `spikes/V1-data-ephemeris/node/selenographic.ts`, exporting `lunarSubPoints(date: Date)` → `{ sunLonDeg, sunLatDeg, earthLonDeg, earthLatDeg, earthDistKm }`, longitudes in (−180, 180]. It runs unmodified under Node 24 (`node compare.ts ../ephemeris_2027.json`).

Details that matter when copying it: `axis.ra` is in hours (multiply by 15), `axis.spin` is the prime-meridian angle W in degrees measured from the node vector `(-sin ra, cos ra, 0)`, and the Sun vector is `GeoVector(Sun, t, true)` minus `GeoMoon(t)`.

## Edits PLAN.md should receive

1. Line 84, input data. Replace "LRO LOLA DEM (80°S–90°S, 20 m/px y 60–120 m/px)" with:
   - Horizon DEM: `ldem_75s_120m.img` + `ldem_75s_120m.lbl` (116 MB, 75°S–90°S, 120 m), from `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/`.
   - Slope DEM: `ldem_80s_20m.jp2` (268 MB, 80°S–90°S, 20 m), from `.../polar/jp2/`; or `LDEM_80S_20MPP_ADJ.TIF` (2.7 GB) from `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/` if the download is allowed.
2. Line 92, projection. The DEMs are PDS `.img`/`.jp2`, not GeoTIFF. State the convention: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +R=1737400`, `x = (col − W/2 + 0.5)·px`, `y = (H/2 − 0.5 − row)·px`, `lon = atan2(x, y)` east-positive, 0° up, 90°E right. Height (m) = DN × 0.5 above 1737.4 km; for JP2 the 0.5 must be applied by hand.
3. Line 33 and line 84, Diviner. Replace "LRO Diviner T_max" with: Diviner Polar Resource Product `dlre_prp_south.zip` (117 MB) from `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/extras/prp/`, columns `temp_max` and `temp_avg` in K, about 507 m, model-based (Paige et al. 2010), converted to GeoTIFF by a pipeline step. Say that it is an ASCII table and that ΔT can only be `temp_max − temp_avg` from this product (it has no minimum).
4. Line 84, PSR. Name the files: `LPSR_80S_20MPP_ADJ.TIF` (154 MB, 20 m, 0/1) and `LPSR_80S_20MPP_ADJ_1km2.SHP` set (1531 polygons) from `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/`; cite Barker et al. 2023, doi 10.3847/PSJ/acf3e1.
5. Add a validation input: `AVGVISIB_75S_120M_201608.TIF` and `AVGVISIB_75S_120M_201608_EARTH.TIF` from `https://pgda.gsfc.nasa.gov/data/MoonIllumination/` (value = DN × 0.00004, same grid as the horizon DEM; Mazarico et al. 2011). Note they count any part of the disc as visible and average 18.6 years, so a one-year, disc-centre result will differ slightly.
6. Line 83, pipeline stack. `astroquery` is not needed: Horizons is one plain HTTP GET. Record the query (COMMAND='301', CENTER='500@399', QUANTITIES='14,15,20', ANG_FORMAT='DEG', RANGE_UNITS='KM', CSV_FORMAT='YES'), the 90,000-row limit, and the convention: MOON_ME, east-positive, 0–360°, UTC, geocentric observer.
7. Line 95, libration rule. It currently forbids `astronomy-engine` for the view from the Moon. Measured error against Horizons is at most 0.0091° over ten years, so the rule can be relaxed to "Horizons for the offline pipeline; `astronomy-engine` via `RotationAxis` is acceptable in the browser (error below 0.01°)".
8. Add `data/raw/`, `spikes/*/.venv/` and `spikes/*/node/node_modules/` to `.gitignore` before the repo is initialised (766 MB between them).

## Not checked, and why

- USGS Astrogeology copies of the LOLA DEMs: guessed URLs all return a generic HTTP 302, so nothing was learned. PDS and PGDA cover the need.
- `ldem_80s_20m.jp2` was not downloaded; only one remote 1024 × 1024 window was decoded. Full-file local decode time is unmeasured (the 80 m JP2 from the same family decodes locally without trouble).
- `LDEM_80S_20MPP_ADJ.TIF`, the `LDSM_*` slope maps and the other PGDA DEMs were sized by HTTP HEAD but not opened (over the download limits). Their sibling `LPSR_80S_20MPP_ADJ.TIF`, same grid and encoding, opens.
- That 1 means "permanently shadowed" in `LPSR_80S_20MPP_ADJ.TIF` is inferred from the 6 % mean, not read from a label.
- That terrain beyond 75°S cannot matter for the horizon of sites at 80°S is my arithmetic, not a test: at 151 km a feature must stand about 6.6 km above the observer's tangent plane to rise above 0°. `ldem_60s_240m.img` (120 MB) removes the question if it worries anyone.
- The Diviner 240 m cumulative tables were not downloaded (each is over 200 MB and not a raster); only a header and first rows were read.
- The Horizons values are for an observer at the Earth's centre. Direction to a specific DSN station differs by up to about 1° as seen from the Moon; not evaluated.
- The shapefile was inspected by reading its header and attribute table directly; no GIS library was installed to parse the polygons.
