"""Sphere and projection geometry (PLAN.md section 5 conventions).

South polar stereographic on the sphere R = 1,737,400 m, true scale at the pole:
longitude 0 points to +y, 90 E to +x. Angles in degrees, lengths in metres, numpy float64.
"""

import numpy as np

R_M = 1_737_400.0


def latlon_to_xy(lat_deg, lon_deg):
    """Selenographic lat/lon -> stereographic x, y in metres."""
    rho = 2 * R_M * np.tan(np.radians(90.0 + np.asarray(lat_deg, dtype=np.float64)) / 2)
    lon = np.radians(lon_deg)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy_to_latlon(x_m, y_m):
    """Stereographic x, y in metres -> lat, lon with lon in (-180, 180]."""
    lat = -90.0 + 2 * np.degrees(np.arctan(np.hypot(x_m, y_m) / (2 * R_M)))
    lon = np.degrees(np.arctan2(x_m, y_m))
    return lat, np.where(lon == -180.0, 180.0, lon)  # atan2(-0.0, -y) gives -180


def _check_north_up(transform) -> None:
    if transform.b != 0 or transform.d != 0 or transform.e != -transform.a or transform.a <= 0:
        raise ValueError(f"raster must be north-up with square pixels, got {transform!r}")


def xy_to_pixel(transform, x_m, y_m):
    """x, y metres -> fractional (row, col); integer values are pixel centres (0-based)."""
    _check_north_up(transform)
    return (transform.f - y_m) / transform.a - 0.5, (x_m - transform.c) / transform.a - 0.5


def pixel_to_xy(transform, row, col):
    """Fractional (row, col), integers at pixel centres -> x, y metres."""
    _check_north_up(transform)
    return transform.c + (col + 0.5) * transform.a, transform.f - (row + 0.5) * transform.a


def unit_vector(lat_deg, lon_deg) -> np.ndarray:
    """Moon-fixed unit vector [..., 3]: +z north pole, +x lon 0, +y lon 90 E."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def vector_to_latlon(v):
    """Any non-zero vector [..., 3] -> lat, lon of its direction, lon in (-180, 180]."""
    v = np.asarray(v, dtype=np.float64)
    lat = np.degrees(np.arctan2(v[..., 2], np.hypot(v[..., 0], v[..., 1])))
    lon = np.degrees(np.arctan2(v[..., 1], v[..., 0]))
    return lat, np.where(lon == -180.0, 180.0, lon)


def local_frame(lat_deg, lon_deg) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Local (east, north, up) unit vectors, each [..., 3]. At a pole the longitude picks them."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    zero = np.zeros(np.broadcast(lat, lon).shape)
    east = np.stack([-np.sin(lon) + zero, np.cos(lon) + zero, zero], axis=-1)
    north = np.stack(
        [-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat) + zero], axis=-1
    )
    return east, north, unit_vector(lat_deg, lon_deg)
