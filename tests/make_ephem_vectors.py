"""Regenerate tests/vectors/ephem_geometry.json (parity vectors for the TypeScript port).

    python tests/make_ephem_vectors.py

Deterministic: seeded points, committed ephemeris table. test_ephem.py checks the committed
file equals what this script produces.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from pipeline.eos.sunlight import SUN_RADIUS_DEG, sun_metrics
from pipeline.hermes.directions import earth_az_el_deg, sun_az_el_deg
from pipeline.hermes.ephemeris import default_table_path, read_table
from pipeline.hermes.link import earth_metrics
from pipeline.hyperion.geometry import R_M

VECTOR_PATH = Path(__file__).parent / "vectors" / "ephem_geometry.json"
MONTH = (datetime(2027, 2, 1, tzinfo=UTC), datetime(2027, 3, 1, tzinfo=UTC))


def _horizons() -> list[list[float]]:
    az = np.arange(360)
    flat = np.full(360, -0.087)
    wavy = 0.4 + 0.4 * np.sin(np.radians(3 * az))  # 0..0.8 deg, several ridges
    wall = np.where(az < 180, 0.8, -0.5)  # hard step: tests wrap and interpolation at 179/180/359/0
    wall[359] = 1.0  # makes the 359 -> 0 wrap interpolation matter
    return [np.round(h, 4).tolist() for h in (flat, wavy, wall)]


def build() -> dict:
    table = read_table(default_table_path())
    rng = np.random.default_rng(20271)
    i27 = table.index_of(datetime(2027, 1, 1, tzinfo=UTC))
    t_idx = np.sort(rng.integers(i27, i27 + 8760, 50))
    lat = np.round(rng.uniform(-90.0, -80.0, 50), 4)
    lon = np.round(rng.uniform(-180.0, 180.0, 50), 4)
    lat[:3], lon[:3] = [-90.0, -89.9, -80.0], [0.0, 129.78, -45.0]
    height = np.round(rng.uniform(-3000.0, 2000.0, 50), 1)
    sa, se = sun_az_el_deg(lat, lon, table.sun_lat_deg[t_idx], table.sun_lon_deg[t_idx])
    ea, ee = earth_az_el_deg(
        lat, lon, height, table.earth_lat_deg[t_idx], table.earth_lon_deg[t_idx],
        table.earth_dist_km[t_idx],
    )
    cases = [
        {"time_index": int(t), "lat_deg": float(a), "lon_deg": float(o), "height_m": float(h),
         "sun_az_deg": float(x), "sun_el_deg": float(y),
         "earth_az_deg": float(z), "earth_el_deg": float(w)}
        for t, a, o, h, x, y, z, w in zip(t_idx, lat, lon, height, sa, se, ea, ee, strict=True)
    ]
    i0, i1 = table.index_of(MONTH[0]), table.index_of(MONTH[1])
    month = table.slice(i0, i1)
    pts = np.array([[-89.9, 129.78, 1000.0], [-85.5, 20.0, 500.0], [-88.0, -60.0, -1500.0]])
    hor = np.array(_horizons(), dtype=np.float32)  # kernels read float32 horizons
    sp, dh, dt = sun_metrics(pts[:, 0], pts[:, 1], hor, month)
    ep, oh, ot = earth_metrics(pts[:, 0], pts[:, 1], pts[:, 2], hor, month)
    metric_cases = [
        {"lat_deg": float(p[0]), "lon_deg": float(p[1]), "height_m": float(p[2]),
         "horizon_deg": _horizons()[k],
         "sun_pct": float(sp[k]), "dark_max_h": float(dh[k]), "dark_truncated": bool(dt[k]),
         "earth_pct": float(ep[k]), "earth_outage_max_h": float(oh[k]),
         "outage_truncated": bool(ot[k])}
        for k, p in enumerate(pts)
    ]
    return {
        "description": "Parity vectors for Sun/Earth geometry (PLAN.md 5.2-5.4). The TypeScript "
        "port must match geometry within 0.01 deg and metrics within 0.1 percentage points "
        "(dark_max_h / earth_outage_max_h exactly, within one step).",
        "conventions": {
            "angles": "degrees; azimuth clockwise from local north (east = 90), in [0, 360); "
            "elevation above the local horizontal plane; longitude east-positive",
            "moon_radius_m": R_M,
            "frame": "Moon-fixed, +z north, +x lon 0, +y lon 90E; point radius r = R + height_m",
            "sun": "direction of the sub-solar point, no parallax",
            "earth": "normalise(D * unit(sub-Earth) - r * p), D = Earth-Moon centre distance (km)",
            "sun_radius_deg": SUN_RADIUS_DEG,
            "lit_fraction": "clamp((el + rho - H(az)) / (2 rho), 0, 1)",
            "horizon": "360 values, index = azimuth in deg, linear interpolation with wrap at 360",
            "earth_visible": "el_earth > H(az) + mask_deg (mask_deg = 0)",
            "dark_max_h": "longest run of steps with f == 0, hours; *_truncated: the longest run "
            "touches the first or last step",
            "ephemeris": "web/public/data/ephemeris_2026_2036.bin (Float32, float64 math after "
            "reading), row 0 = 2026-01-01T00:00Z, step 3600 s",
        },
        "ephemeris": {"t0": "2026-01-01T00:00:00Z", "step_s": 3600, "n": table.n},
        "geometry_cases": cases,
        "metrics_window": {
            "start": MONTH[0].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end_exclusive": MONTH[1].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "first_time_index": i0, "n_steps": i1 - i0,
        },
        "metrics_cases": metric_cases,
    }


if __name__ == "__main__":
    VECTOR_PATH.parent.mkdir(exist_ok=True)
    VECTOR_PATH.write_text(json.dumps(build(), indent=1) + "\n")
    print("wrote", VECTOR_PATH)
