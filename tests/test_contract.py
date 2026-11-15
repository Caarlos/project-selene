"""Data contract (PLAN.md section 6): schemas, validator, placeholder fixture."""

import json
import shutil
from pathlib import Path

import pytest

from pipeline.fixture import N_CELLS_CAP_R5, cap_cells, write_fixture
from pipeline.schema.validate import scenario_errors, validate_scenario

REPO = Path(__file__).resolve().parents[1]
COMMITTED = REPO / "web" / "public" / "data"


@pytest.fixture(scope="module")
def generated(tmp_path_factory) -> Path:
    return write_fixture(tmp_path_factory.mktemp("data"))


@pytest.fixture
def scenario(generated, tmp_path) -> Path:
    """A private, editable copy of the generated fixture."""
    return Path(shutil.copytree(generated, tmp_path / "fixture"))


def _edit(path: Path, change) -> None:
    doc = json.loads(path.read_text())
    change(doc)
    path.write_text(json.dumps(doc))


def test_cap_r5_has_exactly_14444_cells():
    cells = cap_cells()
    assert len(cells) == len(set(cells)) == N_CELLS_CAP_R5 == 14444


def test_generated_fixture_is_valid_and_synthetic(generated):
    validate_scenario(generated)
    manifest = json.loads((generated / "manifest.json").read_text())
    assert manifest["synthetic"] is True
    assert manifest["grids"][0]["n_cells"] == 14444


def test_committed_fixture_is_valid_reproducible_and_small(generated):
    validate_scenario(COMMITTED / "fixture")
    index = json.loads((COMMITTED / "index.json").read_text())
    assert index == [{"id": "fixture", "manifest": "fixture/manifest.json"}]
    # text artefacts must match what fixture.py writes today (binary ones are size-checked above)
    for name in ("manifest.json", "cells_cap_r5.json"):
        assert (COMMITTED / "fixture" / name).read_bytes() == (generated / name).read_bytes(), (
            f"{name} is stale: run `python -m pipeline.fixture`"
        )
    total = sum(f.stat().st_size for f in COMMITTED.rglob("*") if f.is_file())
    assert total < 7_000_000  # fixture (4.7 MB) + shared 10-year ephemeris (1.75 MB)


def test_fixture_values_vary_and_stay_consistent(generated):
    cells = json.loads((generated / "cells_cap_r5.json").read_text())
    assert max(cells["lat"]) <= -80
    assert len(set(cells["sun_best_pct"])) > 1000
    assert all(m <= b for m, b in zip(cells["sun_mean_pct"], cells["sun_best_pct"], strict=True))
    assert any(v >= 0.2 for v in cells["ice_index"])  # the ice KPI needs some ice-bearing cells


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        (lambda m: m.update(schema_version=2), "schema_version"),
        (lambda m: m.pop("synthetic"), "synthetic"),
        (lambda m: m["grids"][0].update(n_cells=14443), "expected n_cells = 14443"),
        (lambda m: m["grids"][0].pop("horizons_n_cells"), "horizons_cap_r5.bin"),
        (lambda m: m["ephemeris"].update(n=100), "ephemeris_fixture.bin"),
        (lambda m: m["time"].update(end="2029-01-01T00:00:00Z"), "not covered by the ephemeris"),
        (lambda m: m["hillshade"].update(file="nope.webp"), "nope.webp: file missing"),
    ],
)
def test_validator_rejects_broken_manifest(scenario, change, expected):
    _edit(scenario / "manifest.json", change)
    assert any(expected in e for e in scenario_errors(scenario))
    with pytest.raises(ValueError, match="violates the data contract"):
        validate_scenario(scenario)


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        (lambda c: c["svf"].pop(), "svf has 14443 values"),
        (lambda c: c.pop("tmax_k"), "tmax_k"),
        (lambda c: c.update(extra=[]), "extra"),
        (lambda c: c["sun_best_pct"].__setitem__(0, 101), "sun_best_pct/0"),
        (lambda c: c["lon"].__setitem__(0, -180), "lon/0"),
        (lambda c: c["lat"].__setitem__(0, None), "lat/0"),
    ],
)
def test_validator_rejects_broken_cells(scenario, change, expected):
    _edit(scenario / "cells_cap_r5.json", change)
    assert any(expected in e for e in scenario_errors(scenario))


def test_validator_accepts_null_metrics(scenario):
    _edit(scenario / "cells_cap_r5.json", lambda c: c.update(tmax_k=[None] * 14444))
    assert scenario_errors(scenario) == []
