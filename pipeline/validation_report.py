"""Sanity numbers of a built scenario and its comparison with the NASA average visibility maps.

  python -m pipeline.validation_report web/public/data/south-pole-2027

The maps (AVGVISIB_75S_120M_201608*.TIF, DN x 0.00004) average 18.6 years and count any part of
the Sun's disc, so our one-year, disc-integrated means are expected to be somewhat lower.
"""

import json
import sys
from pathlib import Path

import h3
import numpy as np
import rasterio

from pipeline.hyperion.dem import data_raw_dir
from pipeline.hyperion.grid import cell_mean, label_raster

SHACKLETON = (-89.67, 129.78)


def _arr(cells, name):
    return np.array([np.nan if v is None else v for v in cells[name]], dtype=float)


def _stats(x):
    return f"min {np.nanmin(x):.2f}, median {np.nanmedian(x):.2f}, max {np.nanmax(x):.2f}"


def report(scenario: Path) -> None:
    cells = json.loads((scenario / "cells_cap_r5.json").read_text())
    manifest = json.loads((scenario / "manifest.json").read_text())
    n = len(cells["h3"])
    nan = {k: int(np.isnan(_arr(cells, k)).sum()) for k in cells
           if k not in ("h3", "horizon_truncated") and np.isnan(_arr(cells, k)).any()}
    print(f"cells: {n}; columns with null values: {nan or 'none'}")
    sun, earth = _arr(cells, "sun_best_pct"), _arr(cells, "earth_best_pct")
    print(f"sun_best_pct: {_stats(sun)}; cells above 80 %: {int((sun > 80).sum())}")
    print(f"sun_mean_pct: {_stats(_arr(cells, 'sun_mean_pct'))}")
    print(f"earth_best_pct: {_stats(earth)}")
    print(f"earth_mean_pct: {_stats(_arr(cells, 'earth_mean_pct'))}")
    i = cells["h3"].index(h3.latlng_to_cell(*SHACKLETON, 5))
    print("Shackleton cell", {k: cells[k][i] for k in ("lat", "lon", "sun_mean_pct", "sun_best_pct",
                                                       "psr_frac", "tmax_k", "ice_index")})
    print("top 10 by sun_best_pct (cell lat, lon -> best point lat, lon: best %, mean %, elev m):")
    for j in np.argsort(-sun)[:10]:
        print(f"  {cells['lat'][j]:.2f}, {cells['lon'][j]:.2f} -> {cells['best_lat'][j]:.3f}, "
              f"{cells['best_lon'][j]:.3f}: {sun[j]:.1f} %, {cells['sun_mean_pct'][j]:.1f} %, "
              f"{cells['elev_m'][j]:.0f} m")
    lat, lon = _arr(cells, "lat"), _arr(cells, "lon")
    band = (lat <= -80) & (lat >= -85)
    for name, sel in (("near side |lon| < 30", abs(lon) < 30), ("far side |lon| > 150",
                                                                 abs(lon) > 150)):
        v = earth[band & sel]
        print(f"earth_best_pct at 80-85S, {name}: n {len(v)}, mean {v.mean():.1f}, "
              f"median {np.median(v):.1f}")
    print(f"horizon_truncated: {np.mean(cells['horizon_truncated']) * 100:.2f} % of cells")

    raw = data_raw_dir()
    with rasterio.open(raw / "ldem_75s_120m.lbl") as ds:
        transform, shape = ds.transform, ds.shape
    label = label_raster(cells["h3"], transform, shape)
    for ours, tif in (("sun_mean_pct", "AVGVISIB_75S_120M_201608.TIF"),
                      ("earth_mean_pct", "AVGVISIB_75S_120M_201608_EARTH.TIF")):
        with rasterio.open(raw / tif) as ds:
            dn = ds.read(1).astype(np.float32)
            dn[dn == ds.nodata] = np.nan
        nasa = cell_mean(label, np.nan_to_num(dn, nan=0.0) * 0.00004 * 100, n)
        valid = np.bincount(label[(label >= 0) & ~np.isnan(dn)], minlength=n) > 0
        mine = _arr(cells, ours)[valid]
        diff = mine - nasa[valid]
        r = np.corrcoef(mine, nasa[valid])[0, 1]
        print(f"{ours} vs {tif}: n {valid.sum()}, Pearson r {r:.3f}, mean(ours - NASA) "
              f"{diff.mean():.2f} points, mean |diff| {np.abs(diff).mean():.2f}, "
              f"mean ours {mine.mean():.2f}, mean NASA {nasa[valid].mean():.2f}")
    print("ice_source:", manifest["params"]["ice_source"])


if __name__ == "__main__":
    report(Path(sys.argv[1]))
