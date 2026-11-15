"""HERMES lunar-segment Earth link (PLAN.md 5.4).

Earth is visible when its centre elevation exceeds H(az) + mask. Same kernel layout as
eos.sunlight: parallel over points, loop over time, no points x times array.
"""

import numpy as np
from numba import njit, prange

from pipeline.hermes.directions import az_el_numba, frame_at, horizon_at
from pipeline.hermes.ephemeris import EphemerisTable
from pipeline.hyperion.geometry import R_M


@njit(cache=True, parallel=True)
def _earth_kernel(lat, lon, height_m, horizons, earth_vec_km, mask_deg, step_h):
    n = lat.shape[0]
    nt = earth_vec_km.shape[0]
    pct = np.empty(n)
    out_h = np.empty(n)
    trunc = np.zeros(n, dtype=np.bool_)
    for i in prange(n):
        fr = frame_at(lat[i], lon[i])
        r_km = (R_M + height_m[i]) / 1000.0
        ux, uy, uz = fr[6], fr[7], fr[8]
        hor = horizons[i]
        n_vis = 0
        best = 0
        touch = False
        run = 0
        run_touch = False
        for t in range(nt):
            az, el = az_el_numba(
                earth_vec_km[t, 0] - r_km * ux, earth_vec_km[t, 1] - r_km * uy,
                earth_vec_km[t, 2] - r_km * uz, fr,
            )
            visible = el > horizon_at(hor, az) + mask_deg
            if visible:
                n_vis += 1
            else:
                run += 1
                if t == 0 or t == nt - 1:
                    run_touch = True
            if visible or t == nt - 1:
                if run > best:
                    best = run
                    touch = run_touch
                elif run == best and run > 0:
                    touch = touch or run_touch
                run = 0
                run_touch = False
        pct[i] = 100.0 * n_vis / nt
        out_h[i] = best * step_h
        trunc[i] = touch
    return pct, out_h, trunc


def earth_metrics(lat_deg, lon_deg, height_m, horizons_deg, table: EphemerisTable,
                  mask_deg: float = 0.0):
    """Per point: (earth_pct, earth_outage_max_h, outage_truncated).

    height_m: [n] point heights above the reference sphere (parallax uses r = R + height).
    horizons_deg: [n, n_az] as in eos.sunlight.sun_metrics. earth_pct in %, outage in hours;
    outage_truncated is True when the longest outage touches either end of the series.
    """
    return _earth_kernel(
        np.ascontiguousarray(lat_deg, dtype=np.float64),
        np.ascontiguousarray(lon_deg, dtype=np.float64),
        np.ascontiguousarray(height_m, dtype=np.float64),
        np.ascontiguousarray(horizons_deg, dtype=np.float32),
        table.earth_vectors_km(), mask_deg, table.step_h,
    )
