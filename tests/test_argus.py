"""ARGUS known-answer tests (PLAN.md 5.5)."""

import numpy as np
import pytest

from pipeline.argus.terrain import cell_terrain_stats, slope_tri, terrain_for_cells
from pipeline.hyperion.dem import synthetic_dem
from pipeline.hyperion.grid import cap_cells

PX = 80.0


def _ramp(n_rows, n_cols, slope_deg, axis=1):
    r = np.arange(n_cols if axis == 1 else n_rows) * PX * np.tan(np.radians(slope_deg))
    r = np.broadcast_to(r[None, :] if axis == 1 else r[:, None], (n_rows, n_cols))
    return r.astype(np.float32)


@pytest.mark.parametrize("axis", [0, 1])
def test_inclined_plane_gives_its_slope_and_exact_tri(axis):
    slope, tri = slope_tri(_ramp(40, 40, 17.0, axis), PX)
    assert np.allclose(slope, 17.0, atol=1e-3)
    step = PX * np.tan(np.radians(17.0))
    # 6 of the 8 neighbours differ by exactly one step along the ramp, 2 by zero
    assert np.allclose(tri, 6 * step / 8, rtol=1e-4)


def test_half_flat_half_steep_cells():
    h = np.zeros((60, 60), dtype=np.float32)
    h[:, 30:] = _ramp(60, 30, 20.0)
    left_right = np.zeros(h.shape, np.int32)
    left_right[:, 30:] = 1
    s = cell_terrain_stats(h, left_right, 2, PX, block_rows=7)
    assert s["safe_frac"][0] == pytest.approx(1.0, abs=0.05)
    assert s["safe_frac"][1] == pytest.approx(0.0, abs=0.05)
    assert s["slope_p95_deg"][1] == pytest.approx(20.0, abs=0.3)
    # one cell covering both halves: half the pixels are safe, p95 sits on the steep half
    both = cell_terrain_stats(h, np.zeros(h.shape, np.int32), 1, PX, block_rows=7)
    assert both["safe_frac"][0] == pytest.approx(0.5, abs=0.04)
    assert both["slope_p95_deg"][0] == pytest.approx(20.0, abs=0.3)


def test_block_size_does_not_change_the_result():
    h = np.random.default_rng(1).normal(0, 30, (50, 50)).astype(np.float32)
    label = (np.arange(50)[:, None] // 10 * 5 + np.arange(50)[None, :] // 10).astype(np.int32)
    a = cell_terrain_stats(h, label, 25, PX, block_rows=50)
    b = cell_terrain_stats(h, label, 25, PX, block_rows=3)
    for k in a:
        assert np.allclose(a[k], b[k], equal_nan=True), k


def test_flat_sphere_patch_has_zero_slope_and_tri():
    s = terrain_for_cells(cap_cells()[:10], synthetic_dem(crater=None, ridge=None))
    assert np.allclose(s["slope_mean_deg"], 0, atol=1e-4)
    assert np.allclose(s["tri_m"], 0, atol=1e-3)
    assert np.allclose(s["safe_frac"], 1.0)
    assert np.allclose(s["elev_m"], 0)
