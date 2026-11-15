import json
import time
from datetime import UTC, datetime

import numpy as np
import pytest

from pipeline.eos.sunlight import lit_fraction, longest_run, sun_metrics
from pipeline.hermes.directions import earth_az_el_deg, horizon_at, sun_az_el_deg
from pipeline.hermes.ephemeris import (
    EphemerisTable,
    default_table_path,
    read_table,
    wrap_lon_deg,
    write_table,
)
from pipeline.hermes.link import earth_metrics
from pipeline.hyperion.geometry import R_M
from tests.make_ephem_vectors import VECTOR_PATH, build

SUN_DIP = -0.087  # dip of a 2 m observer on a smooth sphere


@pytest.fixture(scope="module")
def table():
    return read_table(default_table_path())


@pytest.fixture(scope="module")
def year27(table):
    i = table.index_of(datetime(2027, 1, 1, tzinfo=UTC))
    return table.slice(i, i + 8760)


def test_wrap_and_table_roundtrip(table, tmp_path):
    np.testing.assert_allclose(wrap_lon_deg([0, 180, 181, 359.5, -180, 540]),
                               [0, 180, -179, -0.5, 180, 180])
    assert table.n == 87648 and table.step_s == 3600
    assert table.t0 == datetime(2026, 1, 1, tzinfo=UTC)
    assert (table.sun_lon_deg > -180).all() and (table.sun_lon_deg <= 180).all()
    assert np.abs(table.sun_lat_deg).max() < 1.7 and 350_000 < table.earth_dist_km.min()
    write_table(table.slice(0, 100), tmp_path / "e.bin")
    back = read_table(tmp_path / "e.bin")
    assert back.n == 100 and (tmp_path / "e.bin").stat().st_size == 100 * 5 * 4
    np.testing.assert_array_equal(back.earth_dist_km, table.earth_dist_km[:100])
    with pytest.raises(ValueError):
        table.index_of(datetime(2027, 1, 1, 0, 30, tzinfo=UTC))


def test_sun_near_pole_on_smooth_sphere():
    # 1 km from the south pole (lat = -90 + 1/30.3 deg): el = -sub-solar latitude, az follows lon
    lat = -90.0 + 1.0 / (R_M / 1000.0 * np.pi / 180.0)
    for slat in (-1.5, 0.0, 1.2):
        _, el = sun_az_el_deg(lat, 40.0, slat, np.arange(0.0, 360.0, 45.0))
        np.testing.assert_allclose(el, -slat, atol=0.05)
    az, _ = sun_az_el_deg(lat, 0.0, 0.5, [0.0, 90.0, 180.0, -90.0])
    # observer at lon 0 looks along local north = away from the pole towards lon 0
    np.testing.assert_allclose(az, [0.0, 90.0, 180.0, 270.0], atol=0.1)
    az2, _ = sun_az_el_deg(lat, 0.0, 0.5, np.array([10.0, 20.0, 30.0]))
    assert (np.diff(az2) > 0).all()


def test_sun_at_subsolar_point():
    az, el = sun_az_el_deg(0.0, 33.0, 0.0, 33.0)
    assert el == pytest.approx(90.0, abs=1e-6)
    _, el = sun_az_el_deg(0.0, 33.0, 0.0, 33.0 + 90.0)
    assert el == pytest.approx(0.0, abs=1e-9)


def test_earth_parallax():
    D = 384_400.0
    # 90 deg from the sub-Earth point at sea level: below the plane by atan(R/D), ~ -0.26 deg
    _, el = earth_az_el_deg(0.0, 90.0, 0.0, 0.0, 0.0, D)
    assert el == pytest.approx(-np.degrees(np.arctan((R_M / 1000) / D)), abs=1e-6)
    assert -0.27 < el < -0.25
    # at the sub-Earth point it is overhead, and height does not change that
    _, el = earth_az_el_deg(10.0, 20.0, 1500.0, 10.0, 20.0, D)
    assert el == pytest.approx(90.0)
    # Sun has no parallax: still exactly 0 there
    _, el_sun = sun_az_el_deg(0.0, 90.0, 0.0, 0.0)
    assert el_sun == pytest.approx(0.0, abs=1e-9)


def test_horizon_interpolation_wraps():
    h = np.zeros(360, dtype=np.float32)
    h[359], h[0] = 2.0, 4.0
    assert horizon_at(h, 359.0) == pytest.approx(2.0)
    assert horizon_at(h, 359.5) == pytest.approx(3.0)
    assert horizon_at(h, 0.0) == pytest.approx(4.0)
    assert horizon_at(h, 0.25) == pytest.approx(3.0)  # 0 -> 1: 4 -> 0
    assert horizon_at(h, 359.999) == pytest.approx(4.0, abs=0.01)
    h4 = np.array([0, 10, 20, 30], dtype=np.float32)  # 90 deg spacing
    assert horizon_at(h4, 315.0) == pytest.approx(15.0)  # between 30 (270) and 0 (360)


def test_lit_fraction_by_hand():
    rho = 0.266
    f = lit_fraction([-rho - 0.1, -rho, 0.0, rho, 1.0], 0.0)
    np.testing.assert_allclose(f, [0, 0, 0.5, 1, 1])
    assert lit_fraction(1.0, 1.0) == pytest.approx(0.5)  # horizon through the disc centre


def test_longest_run_hand_made():
    assert longest_run([0, 0, 0]) == (0, False)
    assert longest_run([1, 1, 1]) == (3, True)
    assert longest_run([0, 1, 1, 0, 1, 0]) == (2, False)
    assert longest_run([1, 1, 0, 1, 0]) == (2, True)  # touches the start
    assert longest_run([0, 1, 0, 1, 1]) == (2, True)  # touches the end
    assert longest_run([1, 0, 1, 1, 0, 1]) == (2, False)  # ends touched only by shorter runs
    assert longest_run([1, 1, 0, 1, 1, 0]) == (2, True)  # tie, one of them touches


def _const_table(sun_lon, sun_lat=0.0, n=1):
    z = np.zeros(n)
    return EphemerisTable(datetime(2027, 1, 1, tzinfo=UTC), 3600, np.full(n, float(sun_lon)),
                          np.full(n, float(sun_lat)), z, z, np.full(n, 384_400.0))


def test_kernel_lit_fractions_and_runs():
    # point on the equator at lon 0; Sun on the horizon at lon 90 (az 270 seen from... use el)
    lat, lon = np.array([0.0]), np.array([0.0])
    flat = np.zeros((1, 360), dtype=np.float32)
    # series of Sun elevations by moving the sub-solar longitude: 90 -> el 0 (half lit),
    # 0 -> el 90 (lit), 180 -> el -90 (dark), 91 -> el -1 (dark)
    cols = {"half": 90.0, "lit": 0.0, "dark": 180.0}
    for key, expect in (("half", 50.0), ("lit", 100.0), ("dark", 0.0)):
        pct, dark, trunc = sun_metrics(lat, lon, flat, _const_table(cols[key], n=4))
        assert pct[0] == pytest.approx(expect, abs=0.01)
    assert dark[0] == 4.0 and trunc[0]
    # mixed series: dark, lit, lit, dark, dark, lit  -> dark_max 2 h, not touching an end
    lons = np.array([180.0, 0, 0, 180, 180, 0])
    z = np.zeros(6)
    t = EphemerisTable(datetime(2027, 1, 1, tzinfo=UTC), 3600, lons, z, z, z, np.full(6, 384_400.0))
    pct, dark, trunc = sun_metrics(lat, lon, flat, t)
    assert pct[0] == pytest.approx(100 * 3 / 6) and dark[0] == 2.0 and not trunc[0]
    pct, dark, trunc = sun_metrics(lat, lon, flat, t.slice(3, 6))  # dark, dark, lit
    assert dark[0] == 2.0 and trunc[0]


def test_kernels_match_numpy_geometry(year27):
    rng = np.random.default_rng(3)
    lat, lon = rng.uniform(-90, -80, 6), rng.uniform(-180, 180, 6)
    height = rng.uniform(-2000, 2000, 6)
    hor = rng.uniform(-0.5, 3.0, (6, 360)).astype(np.float32)
    month = year27.slice(0, 744)
    sp, _, _ = sun_metrics(lat, lon, hor, month)
    ep, _, _ = earth_metrics(lat, lon, height, hor, month)
    for k in range(6):
        h_tab = np.concatenate([hor[k], hor[k, :1]]).astype(np.float64)
        sa, se = sun_az_el_deg(lat[k], lon[k], month.sun_lat_deg, month.sun_lon_deg)
        f = lit_fraction(se, np.interp(sa, np.arange(361.0), h_tab))
        assert sp[k] == pytest.approx(100 * f.mean(), abs=1e-6)
        ea, ee = earth_az_el_deg(lat[k], lon[k], height[k], month.earth_lat_deg,
                                 month.earth_lon_deg, month.earth_dist_km)
        vis = ee > np.interp(ea, np.arange(361.0), h_tab)
        assert ep[k] == pytest.approx(100 * vis.mean(), abs=1e-6)


def test_flat_horizon_polar_point_sunlight_2027(year27):
    pct, dark, _ = sun_metrics([-89.9], [0.0], np.full((1, 360), SUN_DIP, np.float32), year27)
    assert 40 < pct[0] < 60
    assert 0 <= dark[0] < 8760
    # Earth is visible about half the time from a pole-ish point too
    ep, _, _ = earth_metrics([-89.9], [0.0], [0.0], np.full((1, 360), SUN_DIP, np.float32), year27)
    assert 40 < ep[0] < 60


def test_kernel_speed_and_memory(year27):
    n = 2000
    rng = np.random.default_rng(0)
    lat, lon = rng.uniform(-90, -80, n), rng.uniform(-180, 180, n)
    hor = np.zeros((n, 360), np.float32)
    sun_metrics(lat[:4], lon[:4], hor[:4], year27.slice(0, 48))  # compile
    earth_metrics(lat[:4], lon[:4], hor[0, :4], hor[:4], year27.slice(0, 48))
    t0 = time.perf_counter()
    sun_metrics(lat, lon, hor, year27)
    t1 = time.perf_counter()
    earth_metrics(lat, lon, np.zeros(n), hor, year27)
    t2 = time.perf_counter()
    print(f"sun {n * 8760 / (t1 - t0):.3g} point-h/s, earth {n * 8760 / (t2 - t1):.3g} point-h/s")


def test_parity_vectors_are_current_and_consistent(table):
    committed = json.loads(VECTOR_PATH.read_text())
    assert committed == json.loads(json.dumps(build()))  # reproducible from the script
    assert len(committed["geometry_cases"]) == 50
    assert committed["metrics_window"]["n_steps"] == 672
    for c in committed["metrics_cases"]:
        assert len(c["horizon_deg"]) == 360
        assert 0 < c["sun_pct"] < 100 and 0 < c["earth_pct"] <= 100
