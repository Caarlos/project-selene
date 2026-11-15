"""ARGUS terrain safety (PLAN.md 5.5): Horn slope and TRI per pixel, statistics per cell.

Heights in metres, slope in degrees, TRI in metres. Pixels are processed in row blocks with a
1-pixel halo; the p95 per cell comes from a per-cell slope histogram (SLOPE_BIN_DEG bins).
"""

from pathlib import Path

import numpy as np
import rasterio

from pipeline.hyperion.dem import LOLA_HEIGHT_M_PER_DN, Dem
from pipeline.hyperion.grid import label_raster

SLOPE_BIN_DEG = 0.25
N_BINS = round(90 / SLOPE_BIN_DEG)


def load_slope_dem(path: Path | str) -> Dem:
    """LOLA polar JP2 (no scale in the file): int16 DN x 0.5 = metres above the sphere."""
    with rasterio.open(path) as ds:
        t = ds.transform
        if ds.dtypes[0] != "int16" or t.a != -t.e or (t.b, t.d) != (0, 0):
            raise ValueError(f"{path}: expected north-up int16 with square pixels, got {t!r}")
        if (t.c, t.f) != (-ds.width / 2 * t.a, ds.height / 2 * t.a):
            raise ValueError(f"{path}: pole is not at the raster centre, {t!r}")
        heights = np.empty(ds.shape, dtype=np.float32)
        for _, window in ds.block_windows(1):
            rows, cols = window.toslices()
            heights[rows, cols] = ds.read(1, window=window) * np.float32(LOLA_HEIGHT_M_PER_DN)
    return Dem(heights, t, float(t.a), synthetic=False)


def slope_tri(h: np.ndarray, pixel_size_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Slope (deg, Horn 3x3 gradient) and TRI (m, mean |dh| to the 8 neighbours) of the interior
    pixels of h: both float32 [rows-2, cols-2]."""
    h = h.astype(np.float32, copy=False)
    a, b, c = h[:-2, :-2], h[:-2, 1:-1], h[:-2, 2:]
    d, f = h[1:-1, :-2], h[1:-1, 2:]
    g, i, j = h[2:, :-2], h[2:, 1:-1], h[2:, 2:]
    dz_dx = ((c + 2 * f + j) - (a + 2 * d + g)) / (8 * pixel_size_m)
    dz_dy = ((g + 2 * i + j) - (a + 2 * b + c)) / (8 * pixel_size_m)
    slope = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    mid = h[1:-1, 1:-1]
    tri = sum(np.abs(n - mid) for n in (a, b, c, d, f, g, i, j)) / 8
    return slope.astype(np.float32), tri.astype(np.float32)


def cell_terrain_stats(heights_m: np.ndarray, label: np.ndarray, n_cells: int,
                       pixel_size_m: float, safe_slope_deg: float = 10.0,
                       block_rows: int = 512) -> dict[str, np.ndarray]:
    """Per-cell slope_mean_deg, slope_p95_deg, tri_m, safe_frac, elev_m (NaN for a cell with no
    interior pixel). `label` is aligned with `heights_m`. The outermost ring of pixels has no
    slope and is skipped for slope and TRI; elev_m uses every labelled pixel."""
    n_rows = heights_m.shape[0]
    n_slope = np.zeros(n_cells)
    sum_slope = np.zeros(n_cells)
    sum_tri = np.zeros(n_cells)
    n_safe = np.zeros(n_cells)
    n_elev = np.bincount(label[label >= 0], minlength=n_cells)
    sum_elev = np.zeros(n_cells)
    hist = np.zeros((n_cells, N_BINS), dtype=np.int64)
    for r0 in range(0, n_rows, block_rows):
        r1 = min(r0 + block_rows, n_rows)
        blk = label[r0:r1]
        ok = blk >= 0
        sum_elev += np.bincount(blk[ok], weights=heights_m[r0:r1][ok], minlength=n_cells)
        lo, hi = max(r0 - 1, 0), min(r1 + 1, n_rows)  # block plus 1-pixel halo
        slope, tri = slope_tri(heights_m[lo:hi], pixel_size_m)  # rows lo+1 .. hi-2
        s0, s1 = max(r0, 1), min(r1, n_rows - 1)  # interior rows of this block
        k = slice(s0 - lo - 1, s1 - lo - 1)
        lab = label[s0:s1, 1:-1]
        ok = lab >= 0
        lab, slope, tri = lab[ok], slope[k][ok].astype(np.float64), tri[k][ok].astype(np.float64)
        n_slope += np.bincount(lab, minlength=n_cells)
        sum_slope += np.bincount(lab, weights=slope, minlength=n_cells)
        sum_tri += np.bincount(lab, weights=tri, minlength=n_cells)
        n_safe += np.bincount(lab, weights=slope < safe_slope_deg, minlength=n_cells)
        bins = np.minimum((slope / SLOPE_BIN_DEG).astype(np.int64), N_BINS - 1)
        hist += np.bincount(lab * N_BINS + bins, minlength=n_cells * N_BINS).reshape(
            n_cells, N_BINS)
    with np.errstate(invalid="ignore", divide="ignore"):
        return {
            "slope_mean_deg": sum_slope / n_slope,
            "slope_p95_deg": _percentile_from_hist(hist, 0.95),
            "tri_m": sum_tri / n_slope,
            "safe_frac": n_safe / n_slope,
            "elev_m": sum_elev / n_elev,
        }


def _percentile_from_hist(hist: np.ndarray, q: float) -> np.ndarray:
    """q-quantile per row, linear inside the bin (NaN for an empty row)."""
    total = hist.sum(axis=1)
    cum = np.cumsum(hist, axis=1)
    target = q * total
    k = (cum < target[:, None]).sum(axis=1).clip(max=N_BINS - 1)
    rows = np.arange(len(hist))
    below = np.where(k > 0, cum[rows, np.maximum(k - 1, 0)], 0)
    frac = (target - below) / np.maximum(hist[rows, k], 1)
    out = (k + np.clip(frac, 0, 1)) * SLOPE_BIN_DEG
    return np.where(total > 0, out, np.nan)


def terrain_for_cells(cells: list[str], dem: Dem, safe_slope_deg: float = 10.0) -> dict:
    """ARGUS statistics of each cell on the slope DEM (its pixel size is the slope baseline)."""
    label = label_raster(cells, dem.transform, dem.heights_m.shape)
    return cell_terrain_stats(dem.heights_m, label, len(cells), dem.pixel_size_m, safe_slope_deg)
