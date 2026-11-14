"""Write the placeholder scenario `fixture` so the web track can start before the real pipeline.

Every value is FAKE (smooth seeded functions of position); the manifest carries `synthetic: true`.
Only the cell set is real: the cap_r5 grid of PLAN.md D-02.

Usage: python -m pipeline.fixture [data_dir]      (default: web/public/data)
"""

import json
import sys
from pathlib import Path

import h3
import numpy as np
from PIL import Image

R_KM = 1737.4
LAT_MAX_DEG = -80.0
RES = 5
N_CELLS_CAP_R5 = 14444  # verified, PLAN.md D-02
# The full horizons file would be 14,444 x 360 x 2 = 10.4 MB; the committed placeholder is kept
# under 5 MB by storing horizons for the first (most poleward) rows only. Stated in the manifest
# as grids[].horizons_n_cells.
HORIZON_CELLS = 3000
EPHEMERIS_ROWS = 8760  # hourly, calendar year 2027 only (the real table spans 2026-2036)
HALF_WIDTH_KM = 304.0  # stereographic radius of latitude -80 deg
HILLSHADE_PX = 512
SEED = 2027


def _stereo_km(lat_deg: np.ndarray, lon_deg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """South polar stereographic x, y (PLAN.md section 7.1)."""
    r = 2 * R_KM * np.tan(np.pi / 4 - np.abs(np.radians(lat_deg)) / 2)
    lon = np.radians(lon_deg)
    return r * np.sin(lon), r * np.cos(lon)


def _waves(rng: np.random.Generator, wavelength_km: float, n: int = 12):
    """A smooth pseudo-random field f(x, y) with values in about [-1, 1]."""
    theta = rng.uniform(0, 2 * np.pi, n)
    k = 2 * np.pi / (wavelength_km * rng.uniform(0.6, 1.6, n))
    phase = rng.uniform(0, 2 * np.pi, n)

    def field(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        arg = np.multiply.outer(x, k * np.cos(theta)) + np.multiply.outer(y, k * np.sin(theta))
        return np.sin(arg + phase).mean(axis=-1) * 2.5

    return field


def cap_cells(res: int = RES, lat_max_deg: float = LAT_MAX_DEG, k: int = 80) -> list[str]:
    """Cells with centre latitude <= lat_max_deg (D-02), most poleward first."""
    disk = h3.grid_disk(h3.latlng_to_cell(-90.0, 0.0, res), k)
    cells = [c for c in disk if h3.cell_to_latlng(c)[0] <= lat_max_deg]
    return sorted(cells, key=lambda c: (h3.cell_to_latlng(c)[0], c))


def write_fixture(data_dir: Path | str = "web/public/data") -> Path:
    data_dir = Path(data_dir)
    out = data_dir / "fixture"
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    broad, medium, fine, other = (_waves(rng, w) for w in (220.0, 60.0, 25.0, 90.0))

    def elev_m(x, y):
        return 1400 * broad(x, y) + 500 * medium(x, y)

    ids = cap_cells()
    assert len(ids) == N_CELLS_CAP_R5, f"cap_r5 has {len(ids)} cells, expected {N_CELLS_CAP_R5}"
    lat, lon = np.array([h3.cell_to_latlng(c) for c in ids]).T
    lat, lon = np.round(lat, 4), np.round(lon, 4)
    lon[lon == -180.0] = 180.0  # contract range is (-180, 180]
    x, y = _stereo_km(lat, lon)

    elev = elev_m(x, y)
    e = np.clip(elev / 1900, -1, 1)
    sun_best = np.clip(42 + 40 * e + 14 * fine(x, y), 0, 100)
    sun_mean = sun_best * np.clip(0.7 + 0.15 * other(x, y), 0.4, 1)
    earth_best = np.clip(50 + 35 * y / HALF_WIDTH_KM + 12 * e + 15 * other(x, y), 0, 100)
    slope_mean = np.clip(9 + 6 * fine(x, y) - 2 * medium(x, y), 0.5, 35)
    tmax = np.round(60 + 2.4 * sun_mean, 1)
    tavg = np.round(40 + 1.2 * sun_mean, 1)
    hours = 8760

    def col(values, decimals):
        return np.round(values, decimals).tolist()

    cells = {
        "h3": ids,
        "lat": lat.tolist(),
        "lon": lon.tolist(),
        "elev_m": col(elev, 0),
        "best_lat": lat.tolist(),
        "best_lon": lon.tolist(),
        "sun_best_pct": col(sun_best, 2),
        "sun_mean_pct": col(sun_mean, 2),
        "dark_max_h_best": col((1 - sun_best / 100) ** 3 * hours, 0),
        "dark_max_h_mean": col((1 - sun_mean / 100) ** 3 * hours, 0),
        "earth_best_pct": col(earth_best, 2),
        "earth_mean_pct": col(earth_best * 0.8, 2),
        "earth_outage_max_h_best": col((1 - earth_best / 100) ** 2 * hours, 0),
        "svf": col(np.clip(0.97 + 0.12 * np.minimum(e, 0) - 0.002 * slope_mean, 0, 1), 3),
        "slope_mean_deg": col(slope_mean, 2),
        "slope_p95_deg": col(np.clip(1.9 * slope_mean + 2, 0, 60), 2),
        "safe_frac": col(np.clip(1.25 - slope_mean / 14, 0, 1), 3),
        "tri_m": col(20 * np.tan(np.radians(slope_mean)), 2),
        "tmax_k": tmax.tolist(),
        "tavg_k": tavg.tolist(),
        "thermal_amp_k": col(tmax - tavg, 1),
        "psr_frac": col(np.clip(1 - sun_mean / 15, 0, 1), 3),
        "ice_index": col(np.clip((125 - tmax) / 40, 0, 1), 3),
        "horizon_truncated": [False] * len(ids),
    }
    (out / "cells_cap_r5.json").write_text(json.dumps(cells, separators=(",", ":")))

    # horizons: Int16 LE centi-degrees, rows x 360
    n_h = HORIZON_CELLS
    az = np.radians(np.arange(360))
    phase = np.pi * (1 + other(x[:n_h], y[:n_h]))[:, None]
    horizon_deg = (
        (1.5 - 2.5 * e[:n_h, None])
        + (1 + np.abs(fine(x[:n_h], y[:n_h])))[:, None] * np.cos(az - phase)
        + 0.5 * np.cos(3 * az + phase)
    )
    np.round(np.clip(horizon_deg, -0.3, 30) * 100).astype("<i2").tofile(out / "horizons_cap_r5.bin")

    # ephemeris: Float32 LE, rows x 5; rough periods and amplitudes only, NOT an ephemeris
    t_d = np.arange(EPHEMERIS_ROWS) / 24
    wrap = lambda deg: (deg + 180) % 360 - 180  # noqa: E731
    eph = np.column_stack([
        wrap(100 - 360 * t_d / 29.53),  # sub-solar longitude, deg
        1.54 * np.sin(2 * np.pi * t_d / 346.6),  # sub-solar latitude, deg
        7.9 * np.sin(2 * np.pi * t_d / 27.55),  # sub-Earth longitude, deg
        6.7 * np.sin(2 * np.pi * t_d / 27.21 + 1.0),  # sub-Earth latitude, deg
        385000 - 21000 * np.cos(2 * np.pi * t_d / 27.55),  # Earth-Moon distance, km
    ])
    eph.astype("<f4").tofile(out / "ephemeris_fixture.bin")

    # hillshade: row 0 is the top (+y); lit from the upper left
    half = HALF_WIDTH_KM
    px = (np.arange(HILLSHADE_PX) + 0.5) / HILLSHADE_PX * 2 * half - half
    z = np.stack([elev_m(px, np.full_like(px, yy)) for yy in px[::-1]])
    dz_dy, dz_dx = np.gradient(z, 2 * half / HILLSHADE_PX)  # rows increase downwards (-y)
    shade = 128 + 110 * np.tanh((dz_dy - dz_dx) / 60)
    Image.fromarray(shade.astype(np.uint8), "L").save(out / "hillshade.webp", quality=80)

    half_m = half * 1000
    manifest = {
        "schema_version": 1,
        "scenario_id": "fixture",
        "synthetic": True,
        "generated_at": "2026-11-14T00:00:00Z",  # fixed so the output is byte-reproducible
        "region": {"name": "south_pole", "lat_max": LAT_MAX_DEG},
        "time": {"start": "2027-01-01T00:00:00Z", "end": "2028-01-01T00:00:00Z", "step_s": 3600},
        "params": {"az_step_deg": 1, "range_km": 150, "observer_height_m": 2, "safe_slope_deg": 10,
                   "samples_per_cell": 8, "slope_baseline_m": 20, "ice_source": "synthetic"},
        "sources": [],
        "projection": {"type": "south_polar_stereographic", "radius_m": R_KM * 1000},
        "hillshade": {"file": "hillshade.webp", "bounds_m": [-half_m, -half_m, half_m, half_m]},
        "ephemeris": {"file": "ephemeris_fixture.bin", "t0": "2027-01-01T00:00:00Z", "step_s": 3600,
                      "n": EPHEMERIS_ROWS},
        "grids": [{"id": "cap_r5", "res": RES, "n_cells": len(ids), "cells": "cells_cap_r5.json",
                   "horizons": "horizons_cap_r5.bin", "horizons_n_cells": n_h}],
        "notes": [
            "Placeholder written by pipeline/fixture.py: every metric, horizon, ephemeris row and "
            "the hillshade are fake. Only the H3 cell set is real.",
            f"Horizons are stored for the first {n_h} cells only (horizons_n_cells) to keep the "
            "fixture small; real scenarios store all cells.",
            "The ephemeris placeholder covers 2027 only; the real table covers 2026-01-01 to "
            "2036-01-01.",
        ],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    index = [{"id": "fixture", "manifest": "fixture/manifest.json"}]
    (data_dir / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    return out


if __name__ == "__main__":
    print(write_fixture(*sys.argv[1:2]))
