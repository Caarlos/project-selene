"""HESTIA ice and temperature (PLAN.md 5.6) and the EOS shadow-proxy fallback (PLAN.md section 4).

Rasters are in the same south polar stereographic plane as the label raster but on other grids:
each raster pixel centre is mapped to a label pixel in projection metres.
"""

import resource
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from pipeline.hyperion.geometry import R_M, pixel_to_xy, xy_to_pixel

ICE_TMAX_K = 110.0  # surface water ice is stable against sublimation below roughly this
DIVINER_NODATA = -999.0
PSR_SHADOW_DN = 20000  # LPSR: +20000 permanently shadowed, -20000 not
DIVINER_PRP_N = 1200


def prp_zip_to_geotiff(src: Path | str, dst: Path | str) -> dict:
    """Diviner Polar Resource Product ASCII triangle table (zip) -> 3-band GeoTIFF
    (temp_avg_K, temp_max_K, ice_depth_m; nodata -999), on the stereographic plane in metres.

    The table has 2 x 1200 x 1200 triangles; each pixel is the mean of the triangles whose centre
    falls in it. Moved from spikes/V1-data-ephemeris/diviner_prp_to_geotiff.py. Returns a
    description of the conversion for SOURCES.json."""
    n = DIVINER_PRP_N
    with zipfile.ZipFile(src) as z, z.open(z.namelist()[0]) as fh:
        fh.readline()  # header row
        # columns 0..8 vertex xyz (km), 9 clon, 10 clat, 11 calt, 12 temp_avg, 13 temp_max,
        # 14 ice_depth
        a = np.loadtxt(fh, delimiter=",", dtype=np.float32,
                       usecols=(0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14))
    if a.shape != (2 * n * n, 12):
        raise ValueError(f"{src}: unexpected table shape {a.shape}")
    r_km = R_M / 1000.0
    c = (a[:, 0:3].astype(np.float64) + a[:, 3:6] + a[:, 6:9]) / 3
    k = 2 * r_km / (np.linalg.norm(c, axis=1) - c[:, 2])  # from the north pole onto the plane
    # the DEM frame has longitude 0 on +y and 90 E on +x (PLAN.md section 5), the Moon-fixed
    # frame has them on +x and +y: swap. The spike converter omitted this and its raster was
    # transposed (checked against the LPSR mask: P(shadow | cold) 0.19 as written, 0.88 swapped).
    x, y = c[:, 1] * k, c[:, 0] * k
    v = a[:, 0:9].astype(np.float64).reshape(-1, 3)  # vertices give the true mesh extent
    kv = 2 * r_km / (np.linalg.norm(v, axis=1) - v[:, 2])
    vx, vy = v[:, 1] * kv, v[:, 0] * kv
    x0, y1 = vx.min(), vy.max()
    step = (vx.max() - x0) / n
    col = np.clip(((x - x0) / step).astype(np.int64), 0, n - 1)
    row = np.clip(((y1 - y) / step).astype(np.int64), 0, n - 1)
    flat = row * n + col
    out = np.full((3, n * n), DIVINER_NODATA, dtype=np.float32)
    for b, j in enumerate((9, 10, 11)):
        val = a[:, j].astype(np.float64)
        ok = val > DIVINER_NODATA + 1
        s = np.bincount(flat[ok], weights=val[ok], minlength=n * n)
        cnt = np.bincount(flat[ok], minlength=n * n)
        out[b, cnt > 0] = (s[cnt > 0] / cnt[cnt > 0]).astype(np.float32)
    crs = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
    with rasterio.open(dst, "w", driver="GTiff", height=n, width=n, count=3, dtype="float32",
                       nodata=DIVINER_NODATA, crs=crs, compress="deflate", tiled=True,
                       transform=from_origin(x0 * 1000, y1 * 1000, step * 1000, step * 1000)) as ds:
        ds.write(out.reshape(3, n, n))
        for i, name in enumerate(("temp_avg_K", "temp_max_K", "ice_depth_m"), 1):
            ds.set_band_description(i, name)
    return {"pixel_size_m": step * 1000, "n_pixels": n * n,
            "peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024}


def _pixel_labels(shape, transform, label: np.ndarray, label_transform) -> np.ndarray:
    """Label of each pixel centre of a raster (int32 [rows, cols]); -1 outside the label grid."""
    rows, cols = np.indices(shape, dtype=np.float64)
    x, y = pixel_to_xy(transform, rows, cols)
    r, c = xy_to_pixel(label_transform, x, y)
    r, c = np.rint(r).astype(np.int64), np.rint(c).astype(np.int64)
    inside = (r >= 0) & (r < label.shape[0]) & (c >= 0) & (c < label.shape[1])
    out = np.full(shape, -1, dtype=np.int32)
    out[inside] = label[r[inside], c[inside]]
    return out


def diviner_cell_stats(path: Path | str, label: np.ndarray, label_transform, n_cells: int):
    """Per cell (tmax_k, tavg_k, ice_index) from the Diviner GeoTIFF bands 1 (avg) and 2 (max).
    NaN for cells without a valid pixel. ice_index = fraction of valid pixels with Tmax < 110 K."""
    with rasterio.open(path) as ds:
        tavg, tmax = ds.read(1), ds.read(2)
        lab = _pixel_labels(ds.shape, ds.transform, label, label_transform)
    ok = (lab >= 0) & (tavg > DIVINER_NODATA) & (tmax > DIVINER_NODATA)
    lab, tavg, tmax = lab[ok], tavg[ok].astype(np.float64), tmax[ok].astype(np.float64)
    n = np.bincount(lab, minlength=n_cells)
    with np.errstate(invalid="ignore", divide="ignore"):
        return (np.bincount(lab, weights=tmax, minlength=n_cells) / n,
                np.bincount(lab, weights=tavg, minlength=n_cells) / n,
                np.bincount(lab, weights=tmax < ICE_TMAX_K, minlength=n_cells) / n)


def psr_cell_fraction(path: Path | str, label: np.ndarray, label_transform, n_cells: int):
    """Fraction of each cell's pixels flagged permanently shadowed in the LPSR raster (DN +20000).
    The raster must be on the label raster's own grid. NaN for a cell without pixels."""
    with rasterio.open(path) as ds:
        if ds.transform != label_transform or ds.shape != label.shape:
            raise ValueError(f"{path}: PSR raster is not on the label raster grid")
        dn = ds.read(1)
        nodata = ds.nodata
    ok = (label >= 0) & (dn != nodata if nodata is not None else True)
    lab = label[ok]
    n = np.bincount(lab, minlength=n_cells)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.bincount(lab, weights=dn[ok] == PSR_SHADOW_DN, minlength=n_cells) / n


def shadow_proxy(sun_pct_lattice: np.ndarray) -> np.ndarray:
    """EOS shadow proxy: fraction of each cell's lattice points ([n_cells, 7]) with sun_pct == 0."""
    return (np.asarray(sun_pct_lattice) == 0).mean(axis=1)
