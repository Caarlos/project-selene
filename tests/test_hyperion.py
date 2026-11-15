"""HYPERION (PLAN.md 5.1, tasks P1 + P2): known-answer tests of section 11."""

import math

import h3
import numpy as np
import pytest
from PIL import Image
from rasterio import Affine

from pipeline.hyperion.dem import (
    LOLA_HORIZON_DEM,
    Crater,
    Ridge,
    data_raw_dir,
    load_lola_dem,
    synthetic_dem,
)
from pipeline.hyperion.geometry import (
    R_M,
    latlon_to_xy,
    local_frame,
    pixel_to_xy,
    unit_vector,
    vector_to_latlon,
    xy_to_latlon,
    xy_to_pixel,
)
from pipeline.hyperion.grid import (
    cap_cells,
    cell_areas_m2,
    cell_centres,
    cell_mean,
    cell_pixel_counts,
    label_raster,
    load_regions,
    region_cells,
    sample_points,
)
from pipeline.hyperion.horizon import (
    centideg_to_horizons,
    horizons_to_centideg,
    sky_view_factor,
    step_table_m,
    trace_horizons,
    write_hillshade,
)

DIP_2M_DEG = -math.degrees(math.acos(R_M / (R_M + 2.0)))  # -0.087 deg
LOLA_TRANSFORM = Affine(120.0, 0.0, -457440.0, 0.0, -120.0, 457440.0)

needs_lola = pytest.mark.skipif(
    not (data_raw_dir() / LOLA_HORIZON_DEM).exists(), reason="LOLA DEM not in SELENE_DATA_RAW"
)


@pytest.fixture(scope="module")
def cap():
    return cap_cells()


@pytest.fixture(scope="module")
def synth():
    """Default crater + ridge on a 120 m grid just larger than the -80 deg cap."""
    return synthetic_dem(pixel_size_m=120.0, half_width_m=321_600.0)


@pytest.fixture(scope="module")
def synth_label(cap, synth):
    return label_raster(cap, synth.transform, synth.heights_m.shape)


@pytest.fixture(scope="module")
def lola():
    return load_lola_dem()


# ---------------------------------------------------------------- projection and frames


def test_projection_known_values():
    x, y = latlon_to_xy([-80.0, -80.0, -80.0, -80.0], [0.0, 90.0, 180.0, -90.0])
    rho = 2 * 1737400.0 * math.tan(math.radians(5.0))  # 304.0 km
    np.testing.assert_allclose(x, [0, rho, 0, -rho], atol=1e-6)
    np.testing.assert_allclose(y, [rho, 0, -rho, 0], atol=1e-6)
    assert np.allclose(latlon_to_xy(-90.0, 123.0), 0.0)
    # pixel convention of PLAN.md section 5 for the 7624 x 7624, 120 m LOLA raster
    row, col = xy_to_pixel(LOLA_TRANSFORM, 0.0, 0.0)
    assert (row, col) == (3811.5, 3811.5)
    x, y = pixel_to_xy(LOLA_TRANSFORM, 10, 7000)
    assert (x, y) == ((7000 - 7624 / 2 + 0.5) * 120, (7624 / 2 - 0.5 - 10) * 120)
    assert xy_to_pixel(LOLA_TRANSFORM, x, y) == (10, 7000)


def test_projection_round_trips_at_antimeridian_and_pole():
    rng = np.random.default_rng(1)
    pole_offset_deg = np.degrees(np.array([100.0, 10.0, 1.0]) / R_M)  # within 100 m of the pole
    lat = np.concatenate([rng.uniform(-90, -60, 500), [-85.0, -85.0, -89.9], -90 + pole_offset_deg])
    lon = np.concatenate([rng.uniform(-180, 180, 500), [180.0, -180.0, 180.0], [180.0, -77.0, 3.0]])
    lat2, lon2 = xy_to_latlon(*latlon_to_xy(lat, lon))
    np.testing.assert_allclose(lat2, lat, atol=1e-9)
    assert (lon2 > -180).all() and (lon2 <= 180).all()
    dlon = (lon2 - lon + 180) % 360 - 180
    # compare as ground distance so the tolerance means the same thing next to the pole
    assert np.abs(np.radians(dlon) * R_M * np.cos(np.radians(lat))).max() < 1e-3
    assert lon2[500] == 180.0 and lon2[501] == 180.0  # -180 is reported as +180
    lat3, lon3 = vector_to_latlon(unit_vector(lat, lon))
    np.testing.assert_allclose(lat3, lat, atol=1e-7)
    assert np.abs(np.radians((lon3 - lon + 180) % 360 - 180) * np.cos(np.radians(lat))).max() < 1e-9
    assert xy_to_latlon(0.0, 0.0)[0] == -90.0


def test_unit_vectors_and_local_frame():
    np.testing.assert_allclose(unit_vector(0, 0), [1, 0, 0], atol=1e-15)
    np.testing.assert_allclose(unit_vector(0, 90), [0, 1, 0], atol=1e-15)
    np.testing.assert_allclose(unit_vector(90, 5), [0, 0, 1], atol=1e-15)
    east, north, up = local_frame(0.0, 0.0)
    np.testing.assert_allclose(east, [0, 1, 0], atol=1e-15)
    np.testing.assert_allclose(north, [0, 0, 1], atol=1e-15)
    lat, lon = np.array([-85.0, -89.99, -90.0, 40.0]), np.array([30.0, 180.0, 0.0, -120.0])
    east, north, up = local_frame(lat, lon)
    np.testing.assert_allclose(np.cross(east, north), up, atol=1e-12)  # right-handed E, N, U
    assert (north[:3, 2] > 0).all()  # north points towards +z
    # east is the direction of increasing longitude
    step = unit_vector(lat, lon + 1e-4) - unit_vector(lat, lon)
    assert (np.einsum("ij,ij->i", step, east)[[0, 1, 3]] > 0).all()


# ---------------------------------------------------------------- grid


def test_cap_r5_count_order_and_areas(cap):
    assert len(cap) == len(set(cap)) == 14444
    # the order pipeline/fixture.py has used since T0: most poleward first, ties by id
    disk = h3.grid_disk(h3.latlng_to_cell(-90.0, 0.0, 5), 80)
    old = [c for c in disk if h3.cell_to_latlng(c)[0] <= -80.0]
    assert cap == sorted(old, key=lambda c: (h3.cell_to_latlng(c)[0], c))
    assert cap[0] == "85f29383fffffff"  # the cell containing the pole (V2-B)
    area_km2 = cell_areas_m2(cap) / 1e6
    assert 16.9 <= area_km2.min() and area_km2.max() <= 22.4
    assert area_km2.mean() == pytest.approx(19.95, abs=0.01)
    assert area_km2.sum() == pytest.approx(288_164, abs=1)
    # same thing as the plan's "h3 area x 0.0744"
    assert area_km2[0] == pytest.approx(h3.cell_area(cap[0], unit="km^2") * 0.0744, rel=1e-3)
    lat, lon = cell_centres(cap)
    assert lat.max() <= -80 and (np.diff(lat) >= 0).all() and lon.min() > -180


def test_other_resolution_and_patch_from_regions_file():
    assert len(cap_cells(5, -85.0)) == 3557  # V2-B
    assert len(cap_cells(6, -85.0)) == 24888  # V2-B
    regions = load_regions()
    assert region_cells(regions["cap_r5"])[:3] == cap_cells()[:3]
    patch = regions["shackleton_ridge"]
    assert (patch["res"], patch["half_size_km"]) == (7, 25.0) and "planetarynames" in patch["source"]
    cells = region_cells(patch)
    assert all(h3.get_resolution(c) == 7 for c in cells[:10])
    x, y = latlon_to_xy(*cell_centres(cells))
    cx, cy = latlon_to_xy(patch["center_lat_deg"], patch["center_lon_deg"])
    assert np.abs(x - cx).max() <= 25_000 and np.abs(y - cy).max() <= 25_000
    assert cell_areas_m2(cells).sum() / 1e6 == pytest.approx(50.0 * 50.0, rel=0.02)


def test_label_raster_covers_each_cell_with_its_area(cap, synth, synth_label):
    label = synth_label
    assert label.dtype == np.int32 and label.shape == synth.heights_m.shape
    assert label.min() == -1 and label.max() == len(cap) - 1
    counts = cell_pixel_counts(label, len(cap))
    lat, lon = cell_centres(cap)
    # stereographic area scale k^2, k = 2 / (1 + sin|lat|)
    k2 = (2 / (1 + np.sin(np.radians(-lat)))) ** 2
    ratio = counts * synth.pixel_size_m**2 / (cell_areas_m2(cap) * k2)
    assert np.abs(ratio - 1).max() < 0.02
    assert ratio.mean() == pytest.approx(1.0, abs=1e-3)
    # the pixel under each cell centre carries that cell, including 7- and 8-vertex cells
    row, col = xy_to_pixel(synth.transform, *latlon_to_xy(lat, lon))
    assert (label[np.rint(row).astype(int), np.rint(col).astype(int)] == np.arange(len(cap))).all()
    n_vertices = np.array([len(h3.cell_to_boundary(c)) for c in cap])
    assert set(n_vertices) == {6, 7, 8} and (n_vertices > 6).sum() == 89  # V2-B
    assert cell_mean(label, synth.heights_m, len(cap)).min() < -1000  # crater floor cells


def test_sample_points(cap, synth, synth_label):
    lat, lon, height = sample_points(cap, synth, synth_label)
    assert lat.shape == lon.shape == height.shape == (14444, 8)
    assert np.isfinite(height).all() and (lon > -180).all() and (lon <= 180).all()
    np.testing.assert_allclose(lat[:, 0], cell_centres(cap)[0], atol=1e-9)
    # centre and lattice points lie inside their own cell (checked independently with H3)
    odd = [i for i, c in enumerate(cap) if len(h3.cell_to_boundary(c)) > 6]
    for i in odd + list(range(0, len(cap), 97)):
        assert {h3.latlng_to_cell(lat[i, j], lon[i, j], 5) for j in range(7)} == {cap[i]}
    # six lattice points: distinct directions about 60 deg apart, at 0.6 of the vertex distance
    east, north, up = local_frame(lat[:, 0], lon[:, 0])
    d = unit_vector(lat[:, 1:7], lon[:, 1:7]) - up[:, None, :]
    bearing = np.arctan2(np.einsum("ijk,ik->ij", d, east), np.einsum("ijk,ik->ij", d, north))
    gaps = np.diff(np.sort(bearing, axis=1), axis=1, append=np.sort(bearing, axis=1)[:, :1] + 2 * np.pi)
    assert np.degrees(gaps).min() > 40 and np.degrees(gaps).max() < 80
    dist_m = np.linalg.norm(d, axis=2) * R_M
    edge_m = np.sqrt(cell_areas_m2(cap) / (1.5 * math.sqrt(3)))  # regular hexagon circumradius
    assert (dist_m > 0.6 * 0.8 * edge_m[:, None]).all() and (dist_m < 0.6 * 1.2 * edge_m[:, None]).all()
    # column 7 is the highest pixel carrying the cell's label
    row, col = np.rint(xy_to_pixel(synth.transform, *latlon_to_xy(lat[:, 7], lon[:, 7]))).astype(int)
    assert (synth_label[row, col] == np.arange(len(cap))).all()
    for i in np.flatnonzero(height[:, 7] > 100)[::50]:
        assert height[i, 7] == synth.heights_m[synth_label == i].max()
    assert (height[:, 7] >= height[:, 0] - 1e-3).mean() > 0.99


# ---------------------------------------------------------------- synthetic DEM


def test_synthetic_dem_matches_its_parameters(synth):
    assert synth.synthetic and synth.heights_m.dtype == np.float32
    assert synth.bounds_m == (-321_600.0, -321_600.0, 321_600.0, 321_600.0)
    c, r = Crater(), Ridge()
    assert synth.height_at(c.lat_deg, c.lon_deg) == pytest.approx(-c.depth_m)
    assert synth.height_at(-90.0, 0.0) == 0.0 and synth.height_at(-81.0, 170.0) == 0.0
    # rim crest: move rim_radius + half the crest width from the centre along the meridian
    crest_lat = c.lat_deg + math.degrees((c.rim_radius_m + c.rim_width_m / 2) / R_M)
    assert synth.height_at(crest_lat, c.lon_deg) == pytest.approx(c.rim_height_m, abs=1.0)
    assert synth.height_at(r.lat0_deg, r.lon0_deg) == pytest.approx(r.height_m, rel=1e-3)
    assert np.isnan(synth.height_at(-70.0, 0.0))  # outside the grid
    assert synthetic_dem(240.0, 24_000.0, None, None).heights_m.shape == (200, 200)


# ---------------------------------------------------------------- horizons


def test_step_table():
    d = step_table_m(120.0, 150_000.0)
    assert d[0] == 120 and d[-1] <= 150_000 < d[-1] * 1.004
    steps = np.diff(d)
    np.testing.assert_allclose(steps, np.maximum(120.0, 0.004 * d[:-1]))
    assert steps[0] == 120 and steps[-1] == pytest.approx(0.004 * d[-2])


def test_smooth_sphere_horizon_is_the_dip_everywhere():
    sphere = synthetic_dem(120.0, 200_400.0, crater=None, ridge=None)
    horizons, truncated = trace_horizons(sphere, [-90.0, -89.0, -89.5], [0.0, 77.0, 180.0])
    assert horizons.shape == (3, 360) and horizons.dtype == np.float32
    assert DIP_2M_DEG == pytest.approx(-0.087, abs=5e-4)
    np.testing.assert_allclose(horizons, DIP_2M_DEG, atol=1e-3)
    assert not truncated.any()
    np.testing.assert_allclose(sky_view_factor(horizons), 1.0)
    # a higher observer sees a lower horizon; coarser azimuth step gives fewer columns
    high, _ = trace_horizons(sphere, [-89.0], [77.0], az_step_deg=45.0, observer_height_m=100.0)
    assert high.shape == (1, 8)
    np.testing.assert_allclose(high, -math.degrees(math.acos(R_M / (R_M + 100.0))), atol=1e-3)
    # rays that leave the DEM before the full range are flagged
    _, truncated = trace_horizons(sphere, [-85.0, -89.0], [0.0, 0.0])
    assert truncated.tolist() == [True, False]
    _, truncated = trace_horizons(sphere, [-85.0], [0.0], range_km=30.0)
    assert not truncated.any()
    with pytest.raises(ValueError, match="outside the DEM"):
        trace_horizons(sphere, [-70.0], [0.0])


@pytest.mark.parametrize(("lat", "lon"), [(-90.0, 0.0), (-88.0, 40.0), (-88.5, -179.0)])
def test_crater_centre_matches_closed_form_rim_elevation(lat, lon):
    crater = Crater(lat, lon, floor_radius_m=20_000, rim_radius_m=30_000, rim_width_m=3_000,
                    outer_radius_m=40_000, depth_m=1_000, rim_height_m=500)
    dem = synthetic_dem(120.0, 240_000.0, crater=crater, ridge=None)
    horizons, truncated = trace_horizons(dem, [lat], [lon])
    # section 5.1 formula at the inner edge of the rim crest (height Hr at distance Dr)
    r0, r1, s = R_M - 1_000 + 2.0, R_M + 500, 30_000 / R_M
    expected = math.degrees(math.atan2(r1 * math.cos(s) - r0, r1 * math.sin(s)))
    assert expected == pytest.approx(2.37, abs=0.01)
    # and that point really is the highest along the analytic profile
    d = np.arange(1.0, 150_000.0)
    profile = np.degrees(np.arctan2((R_M + crater.height_m(d)) * np.cos(d / R_M) - r0,
                                    (R_M + crater.height_m(d)) * np.sin(d / R_M)))
    assert profile.max() == pytest.approx(expected, abs=1e-6)
    assert np.abs(horizons - expected).max() < 0.02
    assert not truncated.any()
    assert sky_view_factor(horizons)[0] == pytest.approx(math.cos(math.radians(expected)) ** 2,
                                                         abs=1e-3)


def _hill(lat, lon):
    return Ridge(lat, lon, lat, lon, height_m=1_000.0, sigma_m=1_000.0)


@pytest.mark.parametrize("obs_lon", [0.0, 135.0, -100.0])
def test_azimuth_is_clockwise_from_north(obs_lon):
    obs_lat = -85.0

    def peak_azimuth(hill_lat, hill_lon):
        dem = synthetic_dem(120.0, 240_000.0, crater=None, ridge=_hill(hill_lat, hill_lon))
        horizons, _ = trace_horizons(dem, [obs_lat], [obs_lon], range_km=30.0)
        assert horizons.max() > 5.0
        opposite = (int(horizons.argmax()) + 180) % 360
        assert horizons[0, opposite] == pytest.approx(DIP_2M_DEG, abs=1e-3)
        return int(horizons.argmax())

    # east = increasing longitude; 3 deg of longitude at 85 S is 7.9 km
    assert abs(peak_azimuth(obs_lat, obs_lon + 3.0) - 90) <= 3
    assert abs(peak_azimuth(obs_lat, obs_lon - 3.0) - 270) <= 3
    assert peak_azimuth(obs_lat + 0.3, obs_lon) in (0, 359, 1)  # towards the north pole
    assert abs(peak_azimuth(obs_lat - 0.3, obs_lon) - 180) <= 1  # towards the south pole


def test_sky_view_factor_and_quantisation():
    horizons = np.array([[30.0] * 4, [-0.087] * 4, [0.0, 90.0, 0.0, 90.0]], dtype=np.float32)
    np.testing.assert_allclose(sky_view_factor(horizons), [0.75, 1.0, 0.5], atol=1e-6)
    q = horizons_to_centideg(np.array([[1.5, -0.087, 12.344, 12.346]]))
    assert q.dtype == np.dtype("<i2") and q.tolist() == [[150, -9, 1234, 1235]]
    assert q.tobytes()[:4] == b"\x96\x00\xf7\xff"
    back = centideg_to_horizons(np.frombuffer(q.tobytes(), dtype="<i2"))
    assert back.dtype == np.float32
    np.testing.assert_allclose(back, [1.5, -0.09, 12.34, 12.35], atol=1e-6)


def test_hillshade_webp_and_bounds(synth, tmp_path):
    out = tmp_path / "hillshade.webp"
    bounds = write_hillshade(synth, out)
    assert bounds == [-304_080.0, -304_080.0, 304_080.0, 304_080.0]  # whole 120 m pixels
    with Image.open(out) as im:
        assert im.format == "WEBP" and im.size == (2048, 2048)
        shade = np.asarray(im.convert("L")).astype(int)

    def pixel(lat, lon, dx_m=0.0, dy_m=0.0):
        x, y = latlon_to_xy(lat, lon)
        scale = 2048 / (bounds[2] - bounds[0])
        return shade[int((bounds[3] - y - dy_m) * scale), int((x + dx_m - bounds[0]) * scale)]

    flat = pixel(-84.0, 100.0)
    assert abs(flat - 180) <= 3  # 255 x sin 45 deg on level ground
    # row 0 is +y and the light comes from the upper left: on the ridge end cap, the flank
    # facing upper left is brighter than level ground, the opposite flank darker
    r = Ridge()
    assert pixel(r.lat0_deg, r.lon0_deg, -3000, 3000) > flat + 20
    assert pixel(r.lat0_deg, r.lon0_deg, 3000, -3000) < flat - 20
    small = write_hillshade(synth, tmp_path / "small.webp", half_width_m=1e6, max_px=256)
    assert small == list(synth.bounds_m)  # clipped to the DEM
    with Image.open(tmp_path / "small.webp") as im:
        assert im.size == (256, 256)


# ---------------------------------------------------------------- real LOLA data


@needs_lola
def test_lola_loads_with_verified_convention(lola):
    assert not lola.synthetic and lola.heights_m.dtype == np.float32
    assert lola.heights_m.shape == (7624, 7624) and lola.pixel_size_m == 120.0
    assert lola.transform == LOLA_TRANSFORM
    # V1-A: the four pixels around the pole, and the full range, in metres (DN x 0.5)
    assert lola.heights_m[3811:3813, 3811:3813].tolist() == [[1303.5, 1284.5], [1301.5, 1278.0]]
    assert 1280 <= lola.height_at(-90.0, 0.0) <= 1300
    assert lola.height_at(-89.67, 129.2) == pytest.approx(-2790, abs=15)
    assert lola.heights_m.min() == -7763.0 and lola.heights_m.max() == 7025.0


@needs_lola
def test_lola_shackleton_floor_is_enclosed_and_ridge_cells_sample(lola):
    horizons, truncated = trace_horizons(lola, [-89.67, -90.0], [129.2, 0.0])
    floor, pole = horizons
    assert not truncated.any()
    assert floor.min() > 5.0 and floor.max() < 45.0  # crater walls in every direction
    assert sky_view_factor(horizons)[0] < 0.95
    assert pole.min() < 0.0  # the pole sits on the rim: open sky in some directions
    # label raster + sample points on the 200 most poleward real cells
    cells = cap_cells()[:200]
    label = label_raster(cells, lola.transform, lola.heights_m.shape)
    lat, lon, height = sample_points(cells, lola, label)
    assert (cell_pixel_counts(label, 200) > 1000).all()
    assert (height[:, 7] >= height[:, :7].max(axis=1) - 1e-3).all()
    assert height.min() < -2500 and height.max() > 1500  # Shackleton floor to nearby massifs
