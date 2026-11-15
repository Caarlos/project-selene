"""SELENE build CLI: one scenario directory in the data contract of PLAN.md section 6.

  python -m pipeline.selene_build --scenario-id south-pole-2027
  python -m pipeline.selene_build --scenario-id demo --synthetic --limit-cells 20 --out /tmp/demo

Stages: cells -> label raster -> sample points -> horizons (cached) -> sun/Earth metrics ->
ARGUS -> HESTIA -> files -> schema validation -> index.json.
"""

import argparse
import hashlib
import json
import sys
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from pipeline.argus.terrain import load_slope_dem, terrain_for_cells
from pipeline.eos.sunlight import sun_metrics
from pipeline.fetch_data import source_entry
from pipeline.hermes.ephemeris import API, default_table_path, read_table
from pipeline.hermes.link import earth_metrics
from pipeline.hestia.ice import diviner_cell_stats, psr_cell_fraction, shadow_proxy
from pipeline.hyperion.dem import Dem, data_raw_dir, load_lola_dem, synthetic_dem
from pipeline.hyperion.geometry import latlon_to_xy
from pipeline.hyperion.grid import (
    SAMPLES_PER_CELL,
    cell_centres,
    label_raster,
    load_regions,
    region_cells,
    sample_points,
)
from pipeline.hyperion.horizon import (
    horizons_to_centideg,
    sky_view_factor,
    trace_horizons,
    write_hillshade,
)
from pipeline.schema.validate import validate_scenario

REPO = Path(__file__).resolve().parents[1]
N_LATTICE = 7  # sample points 0-6; point 7 (highest pixel) only competes for "best"
TRACE_CHUNK = 4000  # points per tracing call (~45 s): progress, resume and low peak memory
METRIC_CHUNK = 20000
TIMES: dict[str, float] = {}


@contextmanager
def stage(name: str):
    print(f"[{name}] ...", flush=True)
    t0 = time.perf_counter()
    yield
    TIMES[name] = time.perf_counter() - t0
    print(f"[{name}] done in {TIMES[name]:.1f} s", flush=True)


def _utc(text: str) -> datetime:
    d = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return d.replace(tzinfo=UTC) if d.tzinfo is None else d.astimezone(UTC)


def _z(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def trace_cached(dem: Dem, lat, lon, key: str, cache_dir: Path, az_step_deg, range_km, obs_m):
    """Horizons [n, n_az] float32 and truncated [n] for all points, traced in chunks into a
    .npy memmap in cache_dir; a finished cache entry is reused, an interrupted one resumed."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    f_h, f_t, f_p = (cache_dir / f"horizons_{key}.{e}" for e in ("npy", "trunc.npy", "progress"))
    n, n_az = len(lat), round(360 / az_step_deg)
    done = int(f_p.read_text()) if f_p.exists() and f_h.exists() and f_t.exists() else 0
    if done:
        H = np.load(f_h, mmap_mode="r+")
        T = np.load(f_t, mmap_mode="r+")
        print(f"  cache {key}: {done}/{n} points already traced", flush=True)
    else:
        H = np.lib.format.open_memmap(f_h, "w+", np.float32, (n, n_az))
        T = np.lib.format.open_memmap(f_t, "w+", np.bool_, (n,))
    t0 = time.perf_counter()
    for i in range(done, n, TRACE_CHUNK):
        j = min(i + TRACE_CHUNK, n)
        H[i:j], T[i:j] = trace_horizons(dem, lat[i:j], lon[i:j], az_step_deg, range_km, obs_m)
        H.flush(), T.flush()
        f_p.write_text(str(j))
        rate = (j - done) / (time.perf_counter() - t0)
        print(f"  horizons {j}/{n} ({rate:.0f} points/s, ETA {(n - j) / rate / 60:.1f} min)",
              flush=True)
    return H, T


def _metrics(lat, lon, height, H, tab):
    """Sun and Earth metrics for all points, in chunks (the kernels copy their horizon rows)."""
    out = [np.empty(len(lat)) for _ in range(4)]
    trunc = [np.empty(len(lat), dtype=bool) for _ in range(2)]
    for i in range(0, len(lat), METRIC_CHUNK):
        s = slice(i, i + METRIC_CHUNK)
        sun, dark, dark_t = sun_metrics(lat[s], lon[s], H[s], tab)
        ear, outage, out_t = earth_metrics(lat[s], lon[s], height[s], H[s], tab)
        for o, v in zip(out, (sun, dark, ear, outage), strict=True):
            o[s] = v
        trunc[0][s], trunc[1][s] = dark_t, out_t
    return out[0], out[1], out[2], out[3], trunc[0], trunc[1]


def _best_point(sun, earth):
    """Index 0-7 of the best point per cell: highest sun_pct, ties highest Earth pct, then the
    lowest index (the centre first)."""
    cand = sun == sun.max(axis=1, keepdims=True)
    e = np.where(cand, earth, -1.0)
    cand &= e == e.max(axis=1, keepdims=True)
    return cand.argmax(axis=1)


def _col(values, decimals, lo=None, hi=None):
    """JSON column: rounded, clipped to the contract range, NaN -> null."""
    v = np.asarray(values, dtype=np.float64)
    if lo is not None:
        v = np.clip(v, lo, hi)
    return [None if np.isnan(x) else float(x) for x in np.round(v, decimals)]


def _lon(values):
    v = np.round(values, 4)
    return np.where(v == -180.0, 180.0, v)


def _resample_360(h: np.ndarray, az_step_deg: float) -> np.ndarray:
    """Horizons at az_step_deg -> 1 degree columns (contract), periodic linear interpolation."""
    if az_step_deg == 1.0:
        return h
    xp = np.arange(h.shape[1] + 1) * az_step_deg
    ext = np.concatenate([h, h[:, :1]], axis=1)
    return np.stack([np.interp(np.arange(360), xp, row) for row in ext]).astype(np.float32)


def _time_entry(t_start, t_end, table) -> dict:
    return {"start": _z(t_start), "end": _z(t_end), "step_s": table.step_s}


def _ephemeris_entry(table) -> dict:
    return {"file": "../" + default_table_path().name, "t0": _z(table.t0),
            "step_s": table.step_s, "n": table.n}


def _update_index(data_dir: Path, scenario_id: str) -> None:
    path = data_dir / "index.json"
    index = json.loads(path.read_text()) if path.exists() else []
    index = [e for e in index if e["id"] != scenario_id]
    index.insert(0, {"id": scenario_id, "manifest": f"{scenario_id}/manifest.json"})
    path.write_text(json.dumps(index, indent=2) + "\n")


def build(args: argparse.Namespace) -> Path:
    raw = data_raw_dir()
    out = Path(args.out) if args.out else REPO / "web" / "public" / "data" / args.scenario_id
    out.mkdir(parents=True, exist_ok=True)
    region = load_regions()[args.region]
    is_cap = region["kind"] == "cap"
    # a patch build adds its grid to the scenario already in `out` and leaves cap_r5 and the
    # hillshade untouched
    base_path = out / "manifest.json"
    base = json.loads(base_path.read_text()) if not is_cap and base_path.exists() else None
    t_start, t_end = _utc(args.start_date), _utc(args.end_date)

    with stage("ephemeris"):
        table = read_table(default_table_path())
        i0, i1 = table.index_of(t_start), table.index_of(t_end)
        if i1 <= i0:
            raise ValueError("end-date must be after start-date")
        tab = table.slice(i0, i1)
        print(f"  {tab.n} steps of {tab.step_h} h", flush=True)
        if base:  # fail before the horizon trace, not after it
            same = {"synthetic": bool(args.synthetic), "time": _time_entry(t_start, t_end, table),
                    "ephemeris": _ephemeris_entry(table)}
            same.update({f"params.{k}": v for k, v in (
                ("az_step_deg", args.az_step), ("range_km", args.range_km),
                ("observer_height_m", args.observer_height_m),
                ("safe_slope_deg", args.safe_slope_deg), ("samples_per_cell", SAMPLES_PER_CELL))})
            have = {"synthetic": base["synthetic"], "time": base["time"],
                    "ephemeris": base["ephemeris"],
                    **{f"params.{k}": v for k, v in base["params"].items()}}
            bad = [k for k, v in same.items() if have.get(k) != v]
            if bad:
                raise ValueError(
                    f"this build differs from the scenario in {out} in: {', '.join(bad)}")

    with stage("dem"):
        if args.synthetic:
            dem = synthetic_dem()
        else:
            dem = load_lola_dem()  # FileNotFoundError when the raw data is missing: blocked
        horizon_dem_name = None if args.synthetic else "ldem_75s_120m.img"

    with stage("cells"):
        cells = region_cells(region)
        if args.limit_cells:
            cells = cells[: args.limit_cells]
        n = len(cells)
        label = label_raster(cells, dem.transform, dem.heights_m.shape)
        lat, lon, height = sample_points(cells, dem, label)  # [n, 8]
        c_lat, c_lon = cell_centres(cells)
        print(f"  {n} cells, {n * SAMPLES_PER_CELL} sample points", flush=True)

    with stage("horizons"):
        dem_id = "synthetic" if args.synthetic else source_entry(horizon_dem_name)["sha256"]
        key = hashlib.sha1(json.dumps([dem_id, args.region, n, args.az_step, args.range_km,
                                       args.observer_height_m]).encode()).hexdigest()[:16]
        H, trunc_pt = trace_cached(dem, lat.ravel(), lon.ravel(), key, Path(args.cache_dir),
                                   args.az_step, args.range_km, args.observer_height_m)

    with stage("metrics"):
        sun, dark, earth, outage, dark_t, out_t = _metrics(
            lat.ravel(), lon.ravel(), height.ravel(), H, tab)
        sun, dark, earth, outage = (a.reshape(n, 8) for a in (sun, dark, earth, outage))
        svf = np.concatenate([sky_view_factor(H[i:i + METRIC_CHUNK])
                              for i in range(0, len(H), METRIC_CHUNK)])
        svf = svf.reshape(n, 8)[:, :N_LATTICE].mean(axis=1)
        best = _best_point(sun, earth)
        rows = np.arange(n)
        best_flat = rows * SAMPLES_PER_CELL + best
        horizon_truncated = trunc_pt.reshape(n, 8).any(axis=1)

    with stage("hillshade"):
        bounds = base["hillshade"]["bounds_m"] if base else write_hillshade(
            dem, out / "hillshade.webp")

    with stage("argus"):
        label_120 = label
        if args.synthetic:
            slope_dem, baseline_m, slope_name = dem, dem.pixel_size_m, None
        else:
            slope_name = "ldem_80s_80m.jp2"
            slope_dem, baseline_m = load_slope_dem(raw / slope_name), 80.0
        terrain = terrain_for_cells(cells, slope_dem, args.safe_slope_deg)
        del slope_dem

    with stage("hestia"):
        diviner, psr_file = raw / "diviner_prp_south_500m.tif", raw / "LPSR_75S_120M_201608.TIF"
        notes = []
        if not args.synthetic and diviner.exists() and psr_file.exists():
            tmax, tavg, ice = diviner_cell_stats(diviner, label_120, dem.transform, n)
            psr = psr_cell_fraction(psr_file, label_120, dem.transform, n)
            ice_source, ice_files = "diviner", ["diviner_prp_south_500m.tif",
                                                "LPSR_75S_120M_201608.TIF"]
        else:
            tmax = tavg = ice = np.full(n, np.nan)
            psr = shadow_proxy(sun[:, :N_LATTICE])
            ice_source, ice_files = "eos_shadow_proxy", []
            notes.append("psr_frac is a proxy: fraction of the cell's 7 lattice points with zero "
                         "sunlight over the scenario (shadowed all of the period); temperatures "
                         "and ice_index are null.")
        del label_120, label

    with stage("write"):
        cells_json = {
            "h3": cells,
            "lat": _col(c_lat, 4), "lon": _lon(c_lon).tolist(),
            "elev_m": _col(terrain["elev_m"], 1),
            "best_lat": _col(lat.ravel()[best_flat], 4),
            "best_lon": _lon(lon.ravel()[best_flat]).tolist(),
            "sun_best_pct": _col(sun[rows, best], 3, 0, 100),
            "sun_mean_pct": _col(sun[:, :N_LATTICE].mean(axis=1), 3, 0, 100),
            "dark_max_h_best": _col(dark[rows, best], 1),
            "dark_max_h_mean": _col(dark[:, :N_LATTICE].mean(axis=1), 1),
            "earth_best_pct": _col(earth[rows, best], 3, 0, 100),
            "earth_mean_pct": _col(earth[:, :N_LATTICE].mean(axis=1), 3, 0, 100),
            "earth_outage_max_h_best": _col(outage[rows, best], 1),
            "svf": _col(svf, 4, 0, 1),
            "slope_mean_deg": _col(terrain["slope_mean_deg"], 2),
            "slope_p95_deg": _col(terrain["slope_p95_deg"], 2),
            "safe_frac": _col(terrain["safe_frac"], 4, 0, 1),
            "tri_m": _col(terrain["tri_m"], 2),
            "tmax_k": _col(tmax, 2), "tavg_k": _col(tavg, 2),
            "thermal_amp_k": _col(tmax - tavg, 2),
            "psr_frac": _col(psr, 4, 0, 1), "ice_index": _col(ice, 4, 0, 1),
            "horizon_truncated": horizon_truncated.tolist(),
        }
        grid_id = args.region
        (out / f"cells_{grid_id}.json").write_text(json.dumps(cells_json, separators=(",", ":")))
        best_h = _resample_360(np.asarray(H[best_flat]), args.az_step)
        horizons_to_centideg(best_h).tofile(out / f"horizons_{grid_id}.bin")

        if not args.synthetic:
            notes.append(f"Slopes and TRI are measured on the {baseline_m:.0f} m LOLA DEM "
                         "(ldem_80s_80m.jp2), not the 20 m product (not downloaded).")
        n_dark, n_out = int(dark_t.reshape(n, 8)[rows, best].sum()), int(
            out_t.reshape(n, 8)[rows, best].sum())
        notes.append(f"For {n_dark} best points the longest dark run and for {n_out} the longest "
                     "Earth outage touches the start or end of the scenario, so it may be "
                     "longer than reported.")
        notes.append(f"{int(horizon_truncated.sum())} cells have a ray that left the DEM before "
                     f"{args.range_km:g} km (horizon_truncated).")
        sources = [source_entry(x, raw) for x in
                   ([horizon_dem_name, "ldem_75s_120m.lbl"] if horizon_dem_name else [])
                   + ([slope_name] if slope_name else []) + ice_files]
        if "diviner_prp_south_500m.tif" in ice_files:
            sources.append(source_entry("dlre_prp_south.zip", raw))
        eph_bin = default_table_path()
        sources.append({"name": eph_bin.name, "url": API,
                        "sha256": hashlib.sha256(eph_bin.read_bytes()).hexdigest()})
        grid = {"id": grid_id, "res": region["res"], "n_cells": n,
                "cells": f"cells_{grid_id}.json", "horizons": f"horizons_{grid_id}.bin"}
        if not is_cap:
            cx, cy = latlon_to_xy(region["center_lat_deg"], region["center_lon_deg"])
            h = region["half_size_km"] * 1000.0
            grid.update(name=args.region, bounds_m=[cx - h, cy - h, cx + h, cy + h])
        manifest = {
            "schema_version": 1,
            "scenario_id": args.scenario_id,
            "synthetic": bool(args.synthetic),
            "generated_at": _z(datetime.now(UTC)),
            "region": {"name": "south_pole" if is_cap else args.region,
                       "lat_max": region["lat_max_deg"] if is_cap else float(c_lat.max())},
            "time": _time_entry(t_start, t_end, table),
            "params": {"az_step_deg": args.az_step, "range_km": args.range_km,
                       "observer_height_m": args.observer_height_m,
                       "safe_slope_deg": args.safe_slope_deg, "samples_per_cell": SAMPLES_PER_CELL,
                       "slope_baseline_m": baseline_m, "ice_source": ice_source},
            "sources": sources,
            "projection": {"type": "south_polar_stereographic", "radius_m": 1737400},
            "hillshade": {"file": "hillshade.webp", "bounds_m": bounds},
            "ephemeris": _ephemeris_entry(table),
            "grids": [grid],
            "notes": notes,
        }
        if base:
            base["grids"] = [g for g in base["grids"] if g["id"] != grid_id] + [grid]
            base["notes"] = [x for x in base.get("notes", []) if not x.startswith(f"[{grid_id}]")
                             ] + [f"[{grid_id}] {x}" for x in notes]
            base["sources"] = base["sources"] + [x for x in sources if x not in base["sources"]]
            manifest = base
        if args.synthetic and not base:
            manifest["notes"].insert(0, "Synthetic terrain (analytic sphere + crater + ridge): "
                                        "terrain metrics are not lunar data.")
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    with stage("validate"):
        validate_scenario(out)  # raises ValueError listing every violation
        _update_index(out.parent, args.scenario_id)
    print("timings:", {k: round(v, 1) for k, v in TIMES.items()}, flush=True)
    return out


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--scenario-id", default="south-pole-2027")
    p.add_argument("--region", default="cap_r5", help="key of pipeline/regions.json")
    p.add_argument("--res", type=int, default=None, help="H3 resolution (taken from regions.json)")
    p.add_argument("--start-date", default="2027-01-01")
    p.add_argument("--end-date", default="2028-01-01", help="exclusive")
    p.add_argument("--az-step", type=float, default=1.0)
    p.add_argument("--range-km", type=float, default=150.0)
    p.add_argument("--observer-height-m", type=float, default=2.0)
    p.add_argument("--safe-slope-deg", type=float, default=10.0)
    p.add_argument("--synthetic", action="store_true")
    p.add_argument("--out", default=None, help="default web/public/data/<scenario_id>")
    p.add_argument("--limit-cells", type=int, default=0, help="first N cells only (tests)")
    p.add_argument("--cache-dir", default=str(REPO / "data" / "cache"))
    args = p.parse_args(argv)
    res = load_regions()[args.region]["res"]
    if args.res is not None and args.res != res:
        p.error(f"--res {args.res} differs from regions.json ({args.region} is res {res})")
    build(args)


if __name__ == "__main__":
    sys.exit(main())
