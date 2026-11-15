"""End-to-end synthetic build (no raw data needed) and the pieces of the build CLI."""

import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from pipeline import selene_build
from pipeline.hermes.ephemeris import default_table_path
from pipeline.schema.validate import scenario_errors

N = 12


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> Path:
    data = tmp_path_factory.mktemp("data")
    shutil.copy(default_table_path(), data / default_table_path().name)  # manifest -> ../ file
    out = data / "demo"
    selene_build.main(["--scenario-id", "demo", "--synthetic", "--limit-cells", str(N),
                       "--start-date", "2027-03-01", "--end-date", "2027-03-11",
                       "--out", str(out), "--cache-dir", str(data / "cache")])
    return out


def test_synthetic_build_is_valid_and_labelled(built):
    assert scenario_errors(built) == []
    manifest = json.loads((built / "manifest.json").read_text())
    assert manifest["synthetic"] is True
    assert manifest["params"]["ice_source"] == "eos_shadow_proxy"
    assert manifest["time"]["end"] == "2027-03-11T00:00:00Z"
    cells = json.loads((built / "cells_cap_r5.json").read_text())
    assert len(cells["h3"]) == N
    assert all(v is None for v in cells["tmax_k"] + cells["ice_index"])
    assert all(0 <= v <= 1 for v in cells["psr_frac"])
    assert all(m <= b + 1e-9 for m, b in zip(cells["sun_mean_pct"], cells["sun_best_pct"],
                                             strict=True))
    index = json.loads((built.parent / "index.json").read_text())
    assert index[0]["id"] == "demo"


def test_horizon_cache_is_reused_for_other_dates(built, capsys):
    selene_build.main(["--scenario-id", "demo2", "--synthetic", "--limit-cells", str(N),
                       "--start-date", "2027-04-01", "--end-date", "2027-04-05",
                       "--out", str(built.parent / "demo2"),
                       "--cache-dir", str(built.parent / "cache")])
    assert f"{N * 8}/{N * 8} points already traced" in capsys.readouterr().out


def test_best_point_ties_prefer_earth_then_centre():
    sun = np.array([[0.0] * 8, [5, 9, 9, 1, 1, 1, 1, 1], [5, 9, 9, 1, 1, 1, 1, 9.0]])
    earth = np.array([[10, 20, 30, 40, 50, 60, 70, 80.0], [0, 10, 50, 0, 0, 0, 0, 0],
                      [0, 10, 10, 0, 0, 0, 0, 10.0]])
    assert selene_build._best_point(sun, earth).tolist() == [7, 2, 1]
    assert selene_build._best_point(np.zeros((1, 8)), np.zeros((1, 8))).tolist() == [0]


def test_resample_to_one_degree_columns():
    h = np.array([[0.0, 10.0, 20.0, 10.0]], dtype=np.float32)  # 90 degree step
    out = selene_build._resample_360(h, 90.0)
    assert out.shape == (1, 360) and out[0, 45] == pytest.approx(5.0)
    assert out[0, 359] == pytest.approx(10 * 1 / 90)  # wraps back towards column 0
