"""DEM container, LOLA polar loader and the synthetic DEM (PLAN.md D-13).

Heights are metres above the R = 1,737,400 m sphere, float32, on a north-up south polar
stereographic grid (see geometry.py).
"""

import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from numba import njit
from rasterio import Affine

from .geometry import R_M, latlon_to_xy, pixel_to_xy, unit_vector, xy_to_latlon, xy_to_pixel

LOLA_HEIGHT_M_PER_DN = 0.5  # PLAN.md section 5: height = DN x 0.5 (the .lbl offset gives radius)
LOLA_HORIZON_DEM = "ldem_75s_120m.lbl"


def data_raw_dir() -> Path:
    """Raw input directory: $SELENE_DATA_RAW, else <repo>/data/raw."""
    default = Path(__file__).resolve().parents[2] / "data" / "raw"
    return Path(os.environ.get("SELENE_DATA_RAW", default))


@njit(cache=True)
def bilinear(heights, row, col):
    """Bilinear height at fractional (row, col); NaN outside the pixel-centre lattice."""
    n_rows, n_cols = heights.shape
    if not (0.0 <= row <= n_rows - 1 and 0.0 <= col <= n_cols - 1):
        return np.nan
    r0 = min(int(row), n_rows - 2)
    c0 = min(int(col), n_cols - 2)
    fr = row - r0
    fc = col - c0
    top = heights[r0, c0] * (1.0 - fc) + heights[r0, c0 + 1] * fc
    bottom = heights[r0 + 1, c0] * (1.0 - fc) + heights[r0 + 1, c0 + 1] * fc
    return top * (1.0 - fr) + bottom * fr


@njit(cache=True)
def _bilinear_many(heights, rows, cols):
    out = np.empty(rows.size)
    for i in range(rows.size):
        out[i] = bilinear(heights, rows[i], cols[i])
    return out


@dataclass(frozen=True)
class Dem:
    heights_m: np.ndarray  # float32 [rows, cols], metres above the reference sphere
    transform: Affine  # pixel corner -> stereographic metres, north-up
    pixel_size_m: float
    synthetic: bool

    def height_at(self, lat_deg, lon_deg) -> np.ndarray:
        """Bilinear height in metres at lat/lon (any shape); NaN outside the DEM."""
        row, col = xy_to_pixel(self.transform, *latlon_to_xy(lat_deg, lon_deg))
        shape = np.shape(row)
        flat = _bilinear_many(self.heights_m, np.ravel(row), np.ravel(col))
        return flat.reshape(shape)

    @property
    def bounds_m(self) -> tuple[float, float, float, float]:
        """(xmin, ymin, xmax, ymax) of the raster's outer pixel edges."""
        rows, cols = self.heights_m.shape
        t = self.transform
        return t.c, t.f - rows * t.a, t.c + cols * t.a, t.f


def load_lola_dem(path: Path | str | None = None) -> Dem:
    """Load a LOLA polar `.lbl`/`.img` DEM, asserting the verified projection convention."""
    path = Path(path) if path else data_raw_dir() / LOLA_HORIZON_DEM
    if not path.exists():
        raise FileNotFoundError(f"LOLA DEM not found: {path} (set SELENE_DATA_RAW or fetch it)")
    with rasterio.open(path) as ds:
        crs = ds.crs.to_dict()
        t = ds.transform
        expected = {"proj": "stere", "lat_0": -90, "lon_0": 0, "R": R_M}
        got = {k: crs.get(k) for k in expected}
        if got != expected or crs.get("lat_ts", -90) != -90 or crs.get("x_0", 0) or crs.get("y_0"):
            raise ValueError(f"{path.name}: unexpected projection {crs}")
        if (t.b, t.d) != (0, 0) or t.e != -t.a or ds.width != ds.height:
            raise ValueError(f"{path.name}: unexpected transform {t!r}")
        if (t.c, t.f) != (-ds.width / 2 * t.a, ds.height / 2 * t.a):
            raise ValueError(f"{path.name}: pole is not at the raster centre, {t!r}")
        if ds.dtypes[0] != "int16" or ds.scales[0] != LOLA_HEIGHT_M_PER_DN:
            raise ValueError(f"{path.name}: expected int16 DN with scale 0.5, got "
                             f"{ds.dtypes[0]} scale {ds.scales[0]}")
        heights = np.empty(ds.shape, dtype=np.float32)
        for _, window in ds.block_windows(1):  # windowed: never a second full-size array
            dn = ds.read(1, window=window)
            if ds.nodata is not None and (dn == ds.nodata).any():
                raise ValueError(f"{path.name}: nodata pixels present, not handled")
            rows, cols = window.toslices()
            heights[rows, cols] = dn * np.float32(LOLA_HEIGHT_M_PER_DN)
    return Dem(heights, t, float(t.a), synthetic=False)


@dataclass(frozen=True)
class Crater:
    """Axisymmetric crater, piecewise linear in great-circle distance d from the centre:
    floor at -depth_m for d <= floor_radius_m, wall up to +rim_height_m at rim_radius_m, flat
    crest of rim_width_m, flank down to 0 at outer_radius_m."""

    lat_deg: float = -88.5
    lon_deg: float = 45.0
    floor_radius_m: float = 6_000.0
    rim_radius_m: float = 10_000.0
    rim_width_m: float = 1_000.0
    outer_radius_m: float = 16_000.0
    depth_m: float = 2_000.0
    rim_height_m: float = 500.0

    def height_m(self, d_m):
        """Height at great-circle distance d_m from the centre."""
        r = [self.floor_radius_m, self.rim_radius_m, self.rim_radius_m + self.rim_width_m,
             self.outer_radius_m]
        return np.interp(d_m, r, [-self.depth_m, self.rim_height_m, self.rim_height_m, 0.0])


@dataclass(frozen=True)
class Ridge:
    """Straight ridge between two points with a Gaussian cross-section. The segment and
    sigma_m are measured in the stereographic plane (scale error under 1.6 % south of 75 S)."""

    lat0_deg: float = -87.0
    lon0_deg: float = -60.0
    lat1_deg: float = -86.0
    lon1_deg: float = -20.0
    height_m: float = 1_500.0
    sigma_m: float = 3_000.0


def _window(dem: Dem, xmin, ymin, xmax, ymax):
    """Row/col slices of the pixels inside a box, and their centre coordinates x[1,n], y[m,1]."""
    n_rows, n_cols = dem.heights_m.shape
    r0, c0 = xy_to_pixel(dem.transform, xmin, ymax)
    r1, c1 = xy_to_pixel(dem.transform, xmax, ymin)
    rows = slice(max(int(np.floor(r0)), 0), min(int(np.ceil(r1)) + 1, n_rows))
    cols = slice(max(int(np.floor(c0)), 0), min(int(np.ceil(c1)) + 1, n_cols))
    x, _ = pixel_to_xy(dem.transform, 0, np.arange(cols.start, cols.stop))
    _, y = pixel_to_xy(dem.transform, np.arange(rows.start, rows.stop), 0)
    return rows, cols, x[None, :], y[:, None]


def synthetic_dem(
    pixel_size_m: float = 120.0,
    half_width_m: float = 457_440.0,
    crater: Crater | None = Crater(),  # noqa: B008 (frozen dataclass)
    ridge: Ridge | None = Ridge(),  # noqa: B008
) -> Dem:
    """Analytic terrain on a LOLA-like grid: smooth sphere (height 0) + crater + ridge."""
    n = round(2 * half_width_m / pixel_size_m)
    if n * pixel_size_m != 2 * half_width_m:
        raise ValueError("half_width_m must be a whole number of half pixels")
    transform = Affine(pixel_size_m, 0, -half_width_m, 0, -pixel_size_m, half_width_m)
    dem = Dem(np.zeros((n, n), dtype=np.float32), transform, float(pixel_size_m), synthetic=True)
    # features are local: only their bounding windows are evaluated
    if crater is not None:
        cx, cy = latlon_to_xy(crater.lat_deg, crater.lon_deg)
        reach = 1.05 * crater.outer_radius_m  # stereographic stretch is < 1.6 %
        rows, cols, x, y = _window(dem, cx - reach, cy - reach, cx + reach, cy + reach)
        chord = np.linalg.norm(
            unit_vector(*xy_to_latlon(x, y)) - unit_vector(crater.lat_deg, crater.lon_deg), axis=-1
        )
        dem.heights_m[rows, cols] += crater.height_m(2 * R_M * np.arcsin(chord / 2))
    if ridge is not None:
        ax, ay = latlon_to_xy(ridge.lat0_deg, ridge.lon0_deg)
        bx, by = latlon_to_xy(ridge.lat1_deg, ridge.lon1_deg)
        reach = 5 * ridge.sigma_m
        rows, cols, x, y = _window(dem, min(ax, bx) - reach, min(ay, by) - reach,
                                   max(ax, bx) + reach, max(ay, by) + reach)
        ux, uy = bx - ax, by - ay
        along = np.clip(((x - ax) * ux + (y - ay) * uy) / max(ux * ux + uy * uy, 1e-9), 0, 1)
        d2 = (x - ax - along * ux) ** 2 + (y - ay - along * uy) ** 2
        dem.heights_m[rows, cols] += ridge.height_m * np.exp(-d2 / (2 * ridge.sigma_m**2))
    return dem
