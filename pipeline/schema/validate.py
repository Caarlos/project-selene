"""Validate a scenario directory against the data contract (PLAN.md section 6).

Usage: python -m pipeline.schema.validate web/public/data/<scenario_id>
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_DIR = Path(__file__).parent
AZIMUTHS = 360
EPHEMERIS_ROW_BYTES = 5 * 4  # 5 x Float32
HORIZON_VALUE_BYTES = 2  # Int16


def _schema_errors(name: str, doc: object, label: str) -> list[str]:
    schema = json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text())
    return [
        f"{label}: {'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message[:200]}"
        for e in Draft202012Validator(schema).iter_errors(doc)
    ][:20]


def _size_error(path: Path, expected: int) -> list[str]:
    if not path.is_file():
        return [f"{path.name}: file missing"]
    actual = path.stat().st_size
    return [] if actual == expected else [f"{path.name}: {actual} bytes, expected {expected}"]


def scenario_errors(scenario_dir: Path | str) -> list[str]:
    """Return every contract violation found (empty list = valid)."""
    d = Path(scenario_dir)
    try:
        manifest = json.loads((d / "manifest.json").read_text())
    except (OSError, ValueError) as exc:
        return [f"manifest.json: {exc}"]
    errors = _schema_errors("manifest", manifest, "manifest.json")
    if errors:
        return errors  # the checks below rely on the manifest's shape

    if not (d / manifest["hillshade"]["file"]).is_file():
        errors.append(f"{manifest['hillshade']['file']}: file missing")

    eph = manifest["ephemeris"]
    errors += _size_error(d / eph["file"], eph["n"] * EPHEMERIS_ROW_BYTES)
    time = manifest["time"]
    t0, start, end = (datetime.fromisoformat(s) for s in (eph["t0"], time["start"], time["end"]))
    # the last step of the scenario (end is exclusive) must be a row of the table
    last_step = end - timedelta(seconds=time["step_s"])
    if not t0 <= start < end or last_step > t0 + timedelta(seconds=eph["step_s"] * (eph["n"] - 1)):
        errors.append("time: scenario span is empty or not covered by the ephemeris table")

    for grid in manifest["grids"]:
        n = grid["n_cells"]
        try:
            cells = json.loads((d / grid["cells"]).read_text())
        except (OSError, ValueError) as exc:
            errors.append(f"{grid['cells']}: {exc}")
            continue
        errors += _schema_errors("cells", cells, grid["cells"])
        errors += [
            f"{grid['cells']}: {name} has {len(col)} values, expected n_cells = {n}"
            for name, col in cells.items()
            if isinstance(col, list) and len(col) != n
        ]
        n_horizons = grid.get("horizons_n_cells", n)
        if n_horizons > n:
            errors.append(f"grid {grid['id']}: horizons_n_cells {n_horizons} > n_cells {n}")
        errors += _size_error(d / grid["horizons"], n_horizons * AZIMUTHS * HORIZON_VALUE_BYTES)
    return errors


def validate_scenario(scenario_dir: Path | str) -> None:
    """Raise ValueError listing every contract violation."""
    errors = scenario_errors(scenario_dir)
    if errors:
        raise ValueError(f"{scenario_dir} violates the data contract:\n  " + "\n  ".join(errors))


if __name__ == "__main__":
    validate_scenario(sys.argv[1])
    print(f"{sys.argv[1]}: valid")
