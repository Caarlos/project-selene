"""H3 cell grids, lunar cell areas, label raster and per-cell sample points (PLAN.md 5.1).

H3 is used as a purely spherical index (D-01): its lat/lon are read as selenographic and every
length or area is computed with the lunar radius, never taken from H3 in Earth units.
"""

import json
import math
from itertools import combinations
from pathlib import Path

import h3
import numpy as np
from numba import njit
from rasterio.features import rasterize

from .dem import Dem
from .geometry import (
    R_M,
    latlon_to_xy,
    local_frame,
    pixel_to_xy,
    unit_vector,
    vector_to_latlon,
    xy_to_latlon,
)

N_CELLS_CAP_R5 = 14444  # verified, PLAN.md D-02
SAMPLES_PER_CELL = 8  # D-03: index 0 centre, 1-6 lattice, 7 highest DEM pixel
REGIONS_FILE = Path(__file__).resolve().parents[1] / "regions.json"


def _disk_cells(lat_deg: float, lon_deg: float, res: int, radius_m: float, keep) -> list[str]:
    """Cells of a grid disk covering radius_m around a point whose id passes keep(lat, lon),
    most poleward (southern) first, ties by id (D-02: grid_disk + filter, no polygon fill)."""
    origin = h3.latlng_to_cell(lat_deg, lon_deg, res)
    # edge of a regular hexagon with the origin cell's lunar area
    edge_m = math.sqrt(h3.cell_area(origin, unit="rads^2") / (1.5 * math.sqrt(3))) * R_M
    # ring k of a hexagonal grid is at least 1.5 * edge * k away; 15 % + 2 rings for distortion
    k = math.ceil(1.15 * radius_m / (1.5 * edge_m)) + 2
    disk = h3.grid_disk(origin, k)
    kept = {c for c in disk if keep(*h3.cell_to_latlng(c))}
    if kept & (set(disk) - set(h3.grid_disk(origin, k - 1))):
        raise AssertionError(f"grid disk k={k} at res {res} does not cover the region")
    return sorted(kept, key=lambda c: (h3.cell_to_latlng(c)[0], c))


def cap_cells(res: int = 5, lat_max_deg: float = -80.0) -> list[str]:
    """South polar cap: cells with centre latitude <= lat_max_deg, most poleward first."""
    cells = _disk_cells(-90.0, 0.0, res, math.radians(90.0 + lat_max_deg) * R_M,
                        lambda lat, lon: lat <= lat_max_deg)
    if (res, lat_max_deg) == (5, -80.0) and len(cells) != N_CELLS_CAP_R5:
        raise AssertionError(f"cap_r5 has {len(cells)} cells, expected {N_CELLS_CAP_R5}")
    return cells


def patch_cells(center_lat_deg: float, center_lon_deg: float, half_size_km: float,
                res: int) -> list[str]:
    """Detail patch: cells whose centre lies in a square of half-size half_size_km, axis-aligned
    in the polar stereographic plane, centred on the given point; most poleward first."""
    half_m = half_size_km * 1000.0
    cx, cy = latlon_to_xy(center_lat_deg, center_lon_deg)

    def keep(lat, lon):
        x, y = latlon_to_xy(lat, lon)
        return abs(x - cx) <= half_m and abs(y - cy) <= half_m

    return _disk_cells(center_lat_deg, center_lon_deg, res, half_m * math.sqrt(2), keep)


def load_regions(path: Path | str = REGIONS_FILE) -> dict[str, dict]:
    """Grid definitions of pipeline/regions.json keyed by grid id."""
    return json.loads(Path(path).read_text())["regions"]


def region_cells(region: dict) -> list[str]:
    """Cells of one entry of regions.json."""
    if region["kind"] == "cap":
        return cap_cells(region["res"], region["lat_max_deg"])
    if region["kind"] == "patch":
        return patch_cells(region["center_lat_deg"], region["center_lon_deg"],
                           region["half_size_km"], region["res"])
    raise ValueError(f"unknown region kind {region['kind']!r}")


def cell_centres(cells: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Cell centre lat_deg, lon_deg arrays, lon in (-180, 180]."""
    lat, lon = np.array([h3.cell_to_latlng(c) for c in cells]).T
    return lat, np.where(lon == -180.0, 180.0, lon)


def cell_areas_m2(cells: list[str]) -> np.ndarray:
    """Lunar area of each cell in m2 (H3 solid angle x R^2)."""
    return np.array([h3.cell_area(c, unit="rads^2") for c in cells]) * R_M**2


def label_raster(cells: list[str], transform, shape: tuple[int, int]) -> np.ndarray:
    """int32 [rows, cols] raster on the given stereographic grid (any raster or window of one):
    index into `cells` of the cell containing each pixel centre, -1 outside every cell."""
    shapes = []
    for i, c in enumerate(cells):  # any vertex count; x, y so the pole and +-180 need no care
        x, y = latlon_to_xy(*np.array(h3.cell_to_boundary(c)).T)
        shapes.append(({"type": "Polygon", "coordinates": [list(zip(x, y, strict=True))]}, i))
    return rasterize(shapes, out_shape=shape, transform=transform, fill=-1, dtype="int32")


def cell_pixel_counts(label: np.ndarray, n_cells: int) -> np.ndarray:
    """Number of raster pixels labelled with each cell."""
    return np.bincount(label[label >= 0], minlength=n_cells)


def cell_mean(label: np.ndarray, values: np.ndarray, n_cells: int) -> np.ndarray:
    """Per-cell mean of a raster aligned with the label raster; NaN for cells with no pixel."""
    inside = label >= 0
    sums = np.bincount(label[inside], weights=values[inside], minlength=n_cells)
    with np.errstate(invalid="ignore"):
        return sums / np.bincount(label[inside], minlength=n_cells)


@njit(cache=True)
def _highest_pixels(label, heights, n_cells):
    rows = np.full(n_cells, -1, dtype=np.int64)
    cols = np.full(n_cells, -1, dtype=np.int64)
    best = np.full(n_cells, -np.inf)
    for r in range(label.shape[0]):
        for c in range(label.shape[1]):
            i = label[r, c]
            if i >= 0 and heights[r, c] > best[i]:
                best[i] = heights[r, c]
                rows[i] = r
                cols[i] = c
    return rows, cols


def _six_spread(centre: np.ndarray, lat_deg: float, lon_deg: float, verts: np.ndarray):
    """The 6 of 7 or 8 vertices whose bearings from the centre are most evenly spread."""
    east, north, _ = local_frame(lat_deg, lon_deg)
    bearing = np.arctan2((verts - centre) @ east, (verts - centre) @ north)

    def min_gap(idx):
        b = np.sort(bearing[list(idx)])
        return np.diff(np.append(b, b[0] + 2 * np.pi)).min()

    return verts[list(max(combinations(range(len(verts)), 6), key=min_gap))]


def sample_points(cells: list[str], dem: Dem, label: np.ndarray):
    """Sample points of each cell (D-03) as (lat_deg, lon_deg, height_m), each [n_cells, 8]:
    column 0 the centre, 1-6 at 0.6 of the way from the centre to six vertices, 7 the highest
    DEM pixel of the cell. `label` is label_raster(cells, dem.transform, dem.heights_m.shape)."""
    vec = np.zeros((len(cells), SAMPLES_PER_CELL, 3))
    for i, c in enumerate(cells):
        lat, lon = h3.cell_to_latlng(c)
        centre = unit_vector(lat, lon)
        verts = unit_vector(*np.array(h3.cell_to_boundary(c)).T)
        if len(verts) > 6:
            verts = _six_spread(centre, lat, lon, verts)
        vec[i, 0] = centre
        vec[i, 1:7] = centre + 0.6 * (verts - centre)
    vec[:, 7] = vec[:, 0]  # placeholder, replaced below
    lat, lon = vector_to_latlon(vec)
    rows, cols = _highest_pixels(label, dem.heights_m, len(cells))
    if (rows < 0).any():
        missing = [cells[i] for i in np.flatnonzero(rows < 0)[:5]]
        raise ValueError(f"cells without any DEM pixel (outside the DEM?): {missing}")
    lat[:, 7], lon[:, 7] = xy_to_latlon(*pixel_to_xy(dem.transform, rows, cols))
    return lat, lon, dem.height_at(lat, lon)
