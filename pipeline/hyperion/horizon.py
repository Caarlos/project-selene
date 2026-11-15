"""Horizon ray tracer, sky view factor, contract quantisation and hillshade (PLAN.md 5.1)."""

import math
from pathlib import Path

import numpy as np
from numba import njit, prange
from PIL import Image

from .dem import Dem, bilinear
from .geometry import R_M, local_frame, xy_to_pixel


def step_table_m(pixel_size_m: float, range_m: float) -> np.ndarray:
    """Sample distances along a ray: step = max(pixel size, 0.004 d) out to range_m."""
    d = [pixel_size_m]
    while (nxt := d[-1] + max(pixel_size_m, 0.004 * d[-1])) <= range_m:
        d.append(nxt)
    return np.array(d)


@njit(parallel=True, cache=True)
def _trace(heights, x_left, y_top, px, up, east, north, r0, cos_az, sin_az, cos_s, sin_s,
           horizons, truncated):
    for i in prange(up.shape[0]):
        cut = False
        for a in range(cos_az.size):
            tx = north[i, 0] * cos_az[a] + east[i, 0] * sin_az[a]
            ty = north[i, 1] * cos_az[a] + east[i, 1] * sin_az[a]
            tz = north[i, 2] * cos_az[a] + east[i, 2] * sin_az[a]
            # el = atan2(r1 cos s - r0, r1 sin s); r1 sin s > 0, so the largest tangent wins
            best = -np.inf
            for k in range(cos_s.size):
                qx = up[i, 0] * cos_s[k] + tx * sin_s[k]
                qy = up[i, 1] * cos_s[k] + ty * sin_s[k]
                qz = up[i, 2] * cos_s[k] + tz * sin_s[k]
                f = 2.0 * R_M / (1.0 - qz)  # south polar stereographic: x = f qy, y = f qx
                h = bilinear(heights, (y_top - f * qx) / px - 0.5, (f * qy - x_left) / px - 0.5)
                if np.isnan(h):  # left the DEM
                    cut = True
                    break
                r1 = R_M + h
                tan_el = (r1 * cos_s[k] - r0[i]) / (r1 * sin_s[k])
                if tan_el > best:
                    best = tan_el
            horizons[i, a] = math.degrees(math.atan(best))
        truncated[i] = cut


def trace_horizons(
    dem: Dem,
    lat_deg,
    lon_deg,
    az_step_deg: float = 1.0,
    range_km: float = 150.0,
    observer_height_m: float = 2.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Horizon elevation profiles of observer points standing observer_height_m above the DEM.

    Returns (horizons_deg float32 [n_points, n_az], truncated bool [n_points]). Column j is
    azimuth j * az_step_deg, clockwise from local north. truncated: a ray left the DEM before
    range_km, so that horizon may be too low.
    """
    lat = np.atleast_1d(np.asarray(lat_deg, dtype=np.float64)).ravel()
    lon = np.atleast_1d(np.asarray(lon_deg, dtype=np.float64)).ravel()
    n_az = round(360.0 / az_step_deg)
    if abs(n_az * az_step_deg - 360.0) > 1e-9:
        raise ValueError(f"az_step_deg={az_step_deg} does not divide 360")
    h0 = dem.height_at(lat, lon)
    if np.isnan(h0).any():
        raise ValueError("observer point outside the DEM")
    east, north, up = local_frame(lat, lon)
    az = np.radians(np.arange(n_az) * az_step_deg)
    s = step_table_m(dem.pixel_size_m, range_km * 1000.0) / R_M
    xy_to_pixel(dem.transform, 0.0, 0.0)  # raises unless north-up square pixels
    horizons = np.empty((lat.size, n_az), dtype=np.float32)
    truncated = np.zeros(lat.size, dtype=np.bool_)
    _trace(dem.heights_m, dem.transform.c, dem.transform.f, dem.pixel_size_m, up, east, north,
           R_M + h0 + observer_height_m, np.cos(az), np.sin(az), np.cos(s), np.sin(s),
           horizons, truncated)
    return horizons, truncated


def sky_view_factor(horizons_deg: np.ndarray) -> np.ndarray:
    """SVF = mean over azimuth of cos^2(max(H, 0)); float32 [n_points]."""
    return (np.cos(np.radians(np.maximum(horizons_deg, 0.0))) ** 2).mean(axis=-1, dtype=np.float32)


def horizons_to_centideg(horizons_deg: np.ndarray) -> np.ndarray:
    """Contract encoding (PLAN.md section 6): little-endian Int16, unit 0.01 deg."""
    return np.round(np.asarray(horizons_deg, dtype=np.float64) * 100.0).astype("<i2")


def centideg_to_horizons(centideg: np.ndarray) -> np.ndarray:
    """Inverse of horizons_to_centideg: float32 degrees."""
    return (np.asarray(centideg, dtype="<i2") / 100.0).astype(np.float32)


def write_hillshade(dem: Dem, path: Path | str, half_width_m: float = 304_000.0,
                    max_px: int = 2048) -> list[float]:
    """Write a shaded relief of the DEM over +-half_width_m (the -80 deg cap) as WebP, at most
    max_px on a side. Returns its bounds [xmin, ymin, xmax, ymax] in projection metres: the
    requested box grown to whole DEM pixels and clipped to the DEM.

    The light comes from the upper left of the image at 45 deg, a map-reading convention, not
    a physical Sun position.
    """
    n_rows, n_cols = dem.heights_m.shape
    row0, col0 = xy_to_pixel(dem.transform, -half_width_m, half_width_m)
    row1, col1 = xy_to_pixel(dem.transform, half_width_m, -half_width_m)
    r0, c0 = max(math.floor(row0 + 0.5), 0), max(math.floor(col0 + 0.5), 0)
    r1, c1 = min(math.ceil(row1 + 0.5), n_rows), min(math.ceil(col1 + 0.5), n_cols)
    t, px = dem.transform, dem.pixel_size_m
    bounds = [t.c + c0 * px, t.f - r1 * px, t.c + c1 * px, t.f - r0 * px]

    scale = min(1.0, max_px / max(r1 - r0, c1 - c0))
    size = (max(round((c1 - c0) * scale), 1), max(round((r1 - r0) * scale), 1))  # (w, h)
    crop = Image.fromarray(dem.heights_m[r0:r1, c0:c1])  # mode F, shares the DEM memory
    z = np.asarray(crop.resize(size, Image.Resampling.BOX) if scale < 1.0 else crop)
    dz_drow, dz_dcol = np.gradient(z, (r1 - r0) * px / size[1], (c1 - c0) * px / size[0])
    # surface normal (-dz/dx, -dz/dy, 1) with y = -row, light from (-1, 1, sqrt 2) / 2
    shade = (0.5 * dz_dcol + 0.5 * dz_drow + math.sqrt(0.5)) / np.sqrt(dz_dcol**2 + dz_drow**2 + 1)
    Image.fromarray(np.round(255 * np.clip(shade, 0, 1)).astype(np.uint8)).save(
        path, format="WEBP", quality=85)
    return bounds
