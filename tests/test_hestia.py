"""HESTIA tests: synthetic rasters with known fractions, plus real-data checks (skipped without)."""

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from pipeline.hestia.ice import (
    DIVINER_NODATA,
    diviner_cell_stats,
    psr_cell_fraction,
    shadow_proxy,
)
from pipeline.hyperion.dem import data_raw_dir, load_lola_dem
from pipeline.hyperion.grid import cap_cells, label_raster

LABEL_T = from_origin(0, 100, 10, 10)  # 10 x 10 px of 10 m
LABEL = np.zeros((10, 10), np.int32)
LABEL[:, 5:] = 1  # cell 0 = left half, cell 1 = right half


def _write(path, bands, transform, nodata, dtype):
    with rasterio.open(path, "w", driver="GTiff", height=bands[0].shape[0],
                       width=bands[0].shape[1], count=len(bands), dtype=dtype, nodata=nodata,
                       transform=transform) as ds:
        ds.write(np.stack(bands).astype(dtype))


def test_diviner_stats_on_a_coarser_grid(tmp_path):
    # 4 x 4 px of 25 m (centres 12.5, 37.5 -> cell 0; 62.5, 87.5 -> cell 1)
    tmax = np.full((4, 4), 100.0)
    tmax[:, 3] = 150.0
    tmax[0, 0] = DIVINER_NODATA  # an invalid pixel is ignored
    tavg = np.full((4, 4), 60.0)
    _write(tmp_path / "d.tif", [tavg, tmax], from_origin(0, 100, 25, 25), DIVINER_NODATA, "float32")
    tmax_k, tavg_k, ice = diviner_cell_stats(tmp_path / "d.tif", LABEL, LABEL_T, 2)
    assert (tmax_k[0], tavg_k[0], ice[0]) == (100.0, 60.0, 1.0)
    assert (tmax_k[1], ice[1]) == (125.0, 0.5)


def test_cell_without_valid_diviner_pixel_is_nan(tmp_path):
    tmax = np.full((4, 4), 100.0)
    tmax[:, 2:] = DIVINER_NODATA
    _write(tmp_path / "d.tif", [tmax, tmax], from_origin(0, 100, 25, 25), DIVINER_NODATA, "float32")
    tmax_k, _, ice = diviner_cell_stats(tmp_path / "d.tif", LABEL, LABEL_T, 2)
    assert np.isnan(tmax_k[1]) and np.isnan(ice[1]) and tmax_k[0] == 100.0


def test_psr_fraction(tmp_path):
    dn = np.full((10, 10), -20000)
    dn[:, :5] = 20000  # cell 0 entirely shadowed
    dn[:5, 5:] = 20000  # half of cell 1
    _write(tmp_path / "p.tif", [dn], LABEL_T, -32768, "int16")
    assert psr_cell_fraction(tmp_path / "p.tif", LABEL, LABEL_T, 2).tolist() == [1.0, 0.5]
    with pytest.raises(ValueError, match="not on the label"):
        psr_cell_fraction(tmp_path / "p.tif", LABEL[:5], LABEL_T, 2)


def test_shadow_proxy_counts_zero_sun_points():
    sun = np.array([[0] * 7, [0, 0, 0, 1, 2, 3, 4], [5] * 7], dtype=float)
    assert shadow_proxy(sun).tolist() == [1.0, 3 / 7, 0.0]


RAW = data_raw_dir()
needs_data = pytest.mark.skipif(
    not all((RAW / f).exists() for f in ("ldem_75s_120m.lbl", "LPSR_75S_120M_201608.TIF",
                                         "diviner_prp_south_500m.tif")),
    reason="raw data not present")


@needs_data
def test_shackleton_floor_cell_is_cold_and_shadowed():
    import h3

    target = h3.latlng_to_cell(-89.67, 129.78, 5)
    assert target in cap_cells()
    dem = load_lola_dem()
    label = label_raster([target], dem.transform, dem.heights_m.shape)
    psr = psr_cell_fraction(RAW / "LPSR_75S_120M_201608.TIF", label, dem.transform, 1)
    tmax, tavg, ice = diviner_cell_stats(RAW / "diviner_prp_south_500m.tif", label,
                                         dem.transform, 1)
    assert psr[0] > 0.85
    assert tmax[0] < 110 and tavg[0] < tmax[0] and ice[0] > 0.8
