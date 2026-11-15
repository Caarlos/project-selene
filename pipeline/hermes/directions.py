"""Sun and Earth azimuth/elevation seen from points on the Moon (PLAN.md 5.2).

Conventions (section 5): degrees, azimuth clockwise from local north (east = 90), elevation above
the local horizontal plane, Moon-fixed frame, R = 1,737,400 m. Sun: direction of the sub-solar
point (no parallax). Earth: normalise(D * unit(sub-Earth) - r * p), r = R + height.

The numpy functions broadcast lat/lon/height against the table columns. The njit helpers below
are shared by the metric kernels (eos.sunlight, hermes.link).
"""

import numpy as np
from numba import njit

from pipeline.hyperion.geometry import R_M, local_frame, unit_vector


def _az_el(d, east, north, up):
    d = d / np.linalg.norm(d, axis=-1, keepdims=True)
    el = np.degrees(np.arcsin(np.clip(np.sum(d * up, axis=-1), -1.0, 1.0)))
    az = np.degrees(np.arctan2(np.sum(d * east, axis=-1), np.sum(d * north, axis=-1))) % 360.0
    return az, el


def sun_az_el_deg(lat_deg, lon_deg, sun_lat_deg, sun_lon_deg):
    """Sun (azimuth, elevation) in degrees; all inputs broadcast together, azimuth in [0, 360)."""
    east, north, up = local_frame(lat_deg, lon_deg)
    return _az_el(unit_vector(*np.broadcast_arrays(sun_lat_deg, sun_lon_deg)), east, north, up)


def earth_az_el_deg(lat_deg, lon_deg, height_m, earth_lat_deg, earth_lon_deg, earth_dist_km):
    """Earth-centre (azimuth, elevation) in degrees, parallax kept; inputs broadcast together."""
    east, north, up = local_frame(lat_deg, lon_deg)
    r_km = (R_M + np.asarray(height_m, dtype=np.float64)) / 1000.0
    d = unit_vector(*np.broadcast_arrays(earth_lat_deg, earth_lon_deg))
    d = d * np.asarray(earth_dist_km)[..., None]
    return _az_el(d - r_km[..., None] * up, east, north, up)


@njit(cache=True)
def frame_at(lat_deg, lon_deg):
    """Local frame as a float64[9]: east, north, up (x, y, z each)."""
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    sl, cl, so, co = np.sin(la), np.cos(la), np.sin(lo), np.cos(lo)
    return np.array([-so, co, 0.0, -sl * co, -sl * so, cl, cl * co, cl * so, sl])


@njit(cache=True)
def az_el_numba(dx, dy, dz, fr):
    """(azimuth in [0, 360), elevation) in degrees of a direction (need not be normalised)."""
    inv = 1.0 / np.sqrt(dx * dx + dy * dy + dz * dz)
    de = (dx * fr[0] + dy * fr[1] + dz * fr[2]) * inv
    dn = (dx * fr[3] + dy * fr[4] + dz * fr[5]) * inv
    du = (dx * fr[6] + dy * fr[7] + dz * fr[8]) * inv
    az = np.degrees(np.arctan2(de, dn))
    if az < 0.0:
        az += 360.0
    return az, np.degrees(np.arcsin(min(1.0, max(-1.0, du))))


@njit(cache=True)
def horizon_at(horizon_deg, az_deg):
    """Horizon elevation, linear in azimuth with wrap-around; column j is azimuth j*360/n."""
    n = horizon_deg.shape[0]
    x = az_deg / (360.0 / n)
    i0 = int(np.floor(x))
    w = x - i0
    i0 %= n
    return horizon_deg[i0] * (1.0 - w) + horizon_deg[(i0 + 1) % n] * w
