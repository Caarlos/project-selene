"""EOS sunlight metrics (PLAN.md 5.3).

f = clamp((el_sun + rho - H(az_sun)) / (2 rho), 0, 1), rho = 0.266 deg. The kernel loops over
time inside a numba prange over points, so memory is O(points + times), never points x times.
"""

import numpy as np
from numba import njit, prange

from pipeline.hermes.directions import az_el_numba, frame_at, horizon_at
from pipeline.hermes.ephemeris import EphemerisTable

SUN_RADIUS_DEG = 0.266


def lit_fraction(el_deg, horizon_deg, rho_deg: float = SUN_RADIUS_DEG):
    """Lit fraction of the Sun's disc for centre elevation and horizon at its azimuth (arrays)."""
    return np.clip((np.asarray(el_deg) + rho_deg - horizon_deg) / (2 * rho_deg), 0.0, 1.0)


def longest_run(mask) -> tuple[int, bool]:
    """Longest run of True in a 1-D series: (length in steps, touches start or end of series).
    If several runs share the maximal length, touches is True when any of them touches an end."""
    best, touch, run, run_touch = 0, False, 0, False
    for i, m in enumerate(list(mask) + [False]):
        if m:
            run += 1
            run_touch = run_touch or i == 0 or i == len(mask) - 1
        elif run:
            if run > best:
                best, touch = run, run_touch
            elif run == best:
                touch = touch or run_touch
            run, run_touch = 0, False
    return best, touch


@njit(cache=True, parallel=True)
def _sun_kernel(lat, lon, horizons, sun_vec, rho, step_h):
    n = lat.shape[0]
    nt = sun_vec.shape[0]
    sun_pct = np.empty(n)
    dark_h = np.empty(n)
    trunc = np.zeros(n, dtype=np.bool_)
    for i in prange(n):
        fr = frame_at(lat[i], lon[i])
        hor = horizons[i]
        total = 0.0
        best = 0
        touch = False
        run = 0
        run_touch = False
        for t in range(nt):
            az, el = az_el_numba(sun_vec[t, 0], sun_vec[t, 1], sun_vec[t, 2], fr)
            f = (el + rho - horizon_at(hor, az)) / (2.0 * rho)
            f = min(1.0, max(0.0, f))
            total += f
            if f == 0.0:
                run += 1
                if t == 0 or t == nt - 1:
                    run_touch = True
            if f != 0.0 or t == nt - 1:
                if run > best:
                    best = run
                    touch = run_touch
                elif run == best and run > 0:
                    touch = touch or run_touch
                run = 0
                run_touch = False
        sun_pct[i] = 100.0 * total / nt
        dark_h[i] = best * step_h
        trunc[i] = touch
    return sun_pct, dark_h, trunc


def sun_metrics(lat_deg, lon_deg, horizons_deg, table: EphemerisTable, rho_deg=SUN_RADIUS_DEG):
    """Per point: (sun_pct, dark_max_h, dark_truncated).

    lat_deg, lon_deg: [n] point coordinates; horizons_deg: [n, n_az] horizon elevation in degrees,
    column j = azimuth j*360/n_az clockwise from north; table: the scenario's slice of the table.
    sun_pct in %, dark_max_h in hours; dark_truncated is True when the longest dark run touches
    either end of the series (so it may be longer than reported).
    """
    return _sun_kernel(
        np.ascontiguousarray(lat_deg, dtype=np.float64),
        np.ascontiguousarray(lon_deg, dtype=np.float64),
        np.ascontiguousarray(horizons_deg, dtype=np.float32),
        table.sun_vectors(), rho_deg, table.step_h,
    )
