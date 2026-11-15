# Baseline validation: `south-pole-2027` (cap_r5)

Produced by `python -m pipeline.validation_report web/public/data/south-pole-2027` after the
full run of `python -m pipeline.selene_build --scenario-id south-pole-2027`. Nothing was tuned.
Parameters: 360 azimuths, 150 km, observer 2 m, hourly 2027-01-01 to 2028-01-01, slopes on the
80 m LOLA DEM (`slope_baseline_m: 80`), ice from Diviner PRP + LOLA PSR (`ice_source: diviner`).

| Check | Result |
|---|---|
| Cells, null values | 14,444; no null in any column |
| `sun_best_pct` | min 0.00, median 40.12, max 86.51; 6 cells above 80 % |
| `sun_mean_pct` | min 0.00, median 30.37, max 50.82 |
| `earth_best_pct` | min 0.00, median 24.25, max 100.00 |
| Shackleton floor cell (89.67S, 129.78E; cell centre 89.685S, 126.105E) | `sun_mean_pct` 0.0, `sun_best_pct` 0.0, `psr_frac` 1.0, `tmax_k` 83.9, `ice_index` 1.0 |
| Earth visibility at 80-85S, near side (&#124;lon&#124; < 30) | n 1664, mean 70.1 %, median 71.7 % |
| Earth visibility at 80-85S, far side (&#124;lon&#124; > 150) | n 1979, mean 1.9 %, median 0.0 % |
| `horizon_truncated` | 0.01 % of cells (about 1 cell) |
| `sun_mean_pct` vs NASA `AVGVISIB_75S_120M_201608.TIF` (per-cell mean of DN x 0.004 %) | Pearson r 0.992; mean(ours - NASA) -0.38 points; mean abs diff 1.35; means 27.08 vs 27.46 |
| `earth_mean_pct` vs NASA `..._EARTH.TIF` | Pearson r 0.988; mean(ours - NASA) -4.21 points; mean abs diff 4.40; means 22.89 vs 27.10 |

Top 10 cells by `sun_best_pct` (cell centre -> best point; best %, lattice-mean %, elevation):

| Cell lat, lon | Best point lat, lon | Best % | Mean % | Elev m |
|---|---|---|---|---|
| -89.42, -133.73 | -89.440, -137.577 | 86.5 | 33.4 | 1625 |
| -89.67, -150.39 | -89.687, -162.711 | 86.1 | 21.4 | 1317 |
| -89.83, -157.30 | -89.781, -155.985 | 85.8 | 28.9 | 1173 |
| -88.87, 125.72 | -88.808, 123.769 | 85.1 | 32.8 | 1384 |
| -88.62, -68.22 | -88.665, -68.341 | 82.3 | 44.2 | 1476 |
| -85.92, -2.63 | -85.964, -2.387 | 80.3 | 45.9 | 4543 |
| -89.31, -110.68 | -89.314, -113.979 | 79.3 | 33.6 | 1342 |
| -88.97, -93.84 | -89.009, -94.697 | 78.2 | 35.4 | 1094 |
| -88.77, -66.07 | -88.704, -68.410 | 77.6 | 30.5 | 1231 |
| -88.46, -69.94 | -88.451, -67.859 | 77.6 | 39.8 | 1117 |

Reading:

* The sunlight pattern matches the published map closely (r 0.992, bias under 0.4 points). The
  one-year, Sun-centre metric is expected to sit slightly below an 18.6-year average that counts
  any part of the disc; here the difference is small.
* Earth visibility is lower than the NASA map by 4.2 points on average. The NASA map counts any
  part of the Earth's disc (angular radius about 0.95 deg from the Moon); ours uses the disc centre
  (PLAN.md 5.4, constraint 5), so a systematic negative bias is expected. Correlation stays high.
* The best-lit cells lie on the high ground within about 1.6 deg of the pole (the rim/ridge
  region) and on the Malapert massif (-85.92, -2.63, 4.5 km high).
* The Diviner GeoTIFF previously in `data/raw` was transposed (x and y swapped); it was rebuilt
  with the fixed `pipeline.hestia.ice.prp_zip_to_geotiff` before this run. Check: P(PSR | Tmax <
  110 K) was 0.19 before and is 0.88 after.
