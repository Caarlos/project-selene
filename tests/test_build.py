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


def test_patch_build_adds_its_grid_and_leaves_the_overview_untouched(built):
    keep = ("cells_cap_r5.json", "horizons_cap_r5.bin", "hillshade.webp")
    before = {f: (built / f).read_bytes() for f in keep}
    selene_build.main(["--region", "shackleton_ridge", "--scenario-id", "demo", "--synthetic",
                       "--limit-cells", "5", "--start-date", "2027-03-01",
                       "--end-date", "2027-03-11", "--out", str(built),
                       "--cache-dir", str(built.parent / "cache")])
    assert scenario_errors(built) == []
    assert {f: (built / f).read_bytes() for f in keep} == before
    manifest = json.loads((built / "manifest.json").read_text())
    cap, patch = manifest["grids"]
    assert cap["id"] == "cap_r5" and "bounds_m" not in cap
    assert (patch["id"], patch["res"], patch["n_cells"]) == ("shackleton_ridge", 7, 5)
    x0, y0, x1, y1 = patch["bounds_m"]
    assert x1 - x0 == pytest.approx(50_000) and y1 - y0 == pytest.approx(50_000)
    assert manifest["region"]["name"] == "south_pole"
    cells = json.loads((built / "cells_shackleton_ridge.json").read_text())
    assert len(cells["h3"]) == 5
    assert sum(n.startswith("Synthetic terrain") for n in manifest["notes"]) == 1
    assert (built / "horizons_shackleton_ridge.bin").stat().st_size == 5 * 360 * 2


def test_patch_build_rejects_a_scenario_with_other_dates(built):
    with pytest.raises(ValueError, match="differs from the scenario .* in: time"):
        selene_build.main(["--region", "shackleton_ridge", "--scenario-id", "demo",
                           "--synthetic", "--limit-cells", "5", "--start-date", "2027-04-01",
                           "--end-date", "2027-04-05", "--out", str(built),
                           "--cache-dir", str(built.parent / "cache")])


def test_patch_build_fails_fast_on_a_different_scenario(built, monkeypatch):
    def no_trace(*a, **k):
        raise AssertionError("the horizon trace started")

    monkeypatch.setattr(selene_build, "trace_cached", no_trace)
    common = ["--region", "shackleton_ridge", "--scenario-id", "demo", "--limit-cells", "5",
              "--start-date", "2027-03-01", "--end-date", "2027-03-11", "--out", str(built),
              "--cache-dir", str(built.parent / "cache")]
    for flag, value in (("--az-step", "2"), ("--observer-height-m", "3")):
        with pytest.raises(ValueError, match="differs from the scenario"):
            selene_build.main([*common, "--synthetic", flag, value])
    with pytest.raises(ValueError, match="in: synthetic"):  # a real patch on a synthetic scenario
        selene_build.main(common)
