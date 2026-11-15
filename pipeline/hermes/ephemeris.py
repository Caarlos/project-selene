"""Sun/Earth ephemeris table (PLAN.md 5.2, 6): JPL Horizons fetch, contract .bin read/write.

Units: degrees (east-positive longitude wrapped to (-180, 180]), kilometres, UTC.
Binary layout: little-endian Float32, n x 5 = sun_lon, sun_lat, earth_lon, earth_lat, earth_dist_km.
Sidecar JSON (same stem, .json): t0, step_s, n.
"""

import json
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from pipeline.hyperion.geometry import unit_vector

API = "https://ssd.jpl.nasa.gov/api/horizons.api"


def wrap_lon_deg(lon_deg):
    """Wrap east-positive longitude to (-180, 180]."""
    return 180.0 - (180.0 - np.asarray(lon_deg, dtype=np.float64)) % 360.0


@dataclass(frozen=True)
class EphemerisTable:
    t0: datetime  # UTC time of row 0
    step_s: int
    sun_lon_deg: np.ndarray  # float64 [n], sub-solar longitude, (-180, 180]
    sun_lat_deg: np.ndarray
    earth_lon_deg: np.ndarray  # sub-Earth point
    earth_lat_deg: np.ndarray
    earth_dist_km: np.ndarray  # Earth-Moon centre distance

    @property
    def n(self) -> int:
        return len(self.sun_lon_deg)

    @property
    def step_h(self) -> float:
        return self.step_s / 3600.0

    def index_of(self, when: datetime) -> int:
        """Row index of a UTC time lying exactly on the grid."""
        k, rem = divmod((when - self.t0).total_seconds(), self.step_s)
        if rem or not 0 <= k < self.n:
            raise ValueError(f"{when} is not a row of the table")
        return int(k)

    def slice(self, i0: int, i1: int) -> "EphemerisTable":
        s = slice(i0, i1)
        return EphemerisTable(
            self.t0 + timedelta(seconds=i0 * self.step_s), self.step_s, self.sun_lon_deg[s],
            self.sun_lat_deg[s], self.earth_lon_deg[s], self.earth_lat_deg[s],
            self.earth_dist_km[s],
        )

    def sun_vectors(self) -> np.ndarray:
        """Unit vectors [n, 3] towards the Sun in the Moon-fixed frame."""
        return unit_vector(self.sun_lat_deg, self.sun_lon_deg)

    def earth_vectors_km(self) -> np.ndarray:
        """Moon centre -> Earth centre vectors [n, 3] in km, Moon-fixed frame."""
        return unit_vector(self.earth_lat_deg, self.earth_lon_deg) * self.earth_dist_km[:, None]


def _from_columns(t0, step_s, sun_lon, sun_lat, earth_lon, earth_lat, dist) -> EphemerisTable:
    def f64(a):
        return np.asarray(a, dtype=np.float64)

    return EphemerisTable(
        t0, int(step_s), wrap_lon_deg(sun_lon), f64(sun_lat), wrap_lon_deg(earth_lon),
        f64(earth_lat), f64(dist),
    )


def _parse_t0(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def table_from_json(path: Path | str) -> EphemerisTable:
    """Horizons-derived JSON as written by the spike (longitudes 0-360)."""
    d = json.loads(Path(path).read_text())
    return _from_columns(_parse_t0(d["t0"]), d["step_s"], d["sun_lon_deg"], d["sun_lat_deg"],
                         d["earth_lon_deg"], d["earth_lat_deg"], d["earth_dist_km"])


def write_table(table: EphemerisTable, bin_path: Path | str) -> None:
    bin_path = Path(bin_path)
    cols = [table.sun_lon_deg, table.sun_lat_deg, table.earth_lon_deg, table.earth_lat_deg,
            table.earth_dist_km]
    bin_path.write_bytes(np.stack(cols, axis=1).astype("<f4").tobytes())
    meta = {"t0": table.t0.strftime("%Y-%m-%dT%H:%M:%SZ"), "step_s": table.step_s, "n": table.n}
    bin_path.with_suffix(".json").write_text(json.dumps(meta) + "\n")


def read_table(bin_path: Path | str) -> EphemerisTable:
    bin_path = Path(bin_path)
    meta = json.loads(bin_path.with_suffix(".json").read_text())
    raw = np.fromfile(bin_path, dtype="<f4")
    if raw.size != meta["n"] * 5:
        raise ValueError(f"{bin_path.name}: {raw.size} values, sidecar says n={meta['n']}")
    c = raw.reshape(-1, 5)
    return _from_columns(_parse_t0(meta["t0"]), meta["step_s"], c[:, 0], c[:, 1], c[:, 2],
                         c[:, 3], c[:, 4])


def default_table_path() -> Path:
    return Path(__file__).resolve().parents[2] / "web/public/data/ephemeris_2026_2036.bin"


# ---- Horizons fetch (network; never called from tests) ----


def fetch_chunk(start: datetime, stop: datetime, step_h: int = 1) -> list[tuple]:
    """Rows (when, earth_lon, earth_lat, sun_lon, sun_lat, dist_km) for start <= t <= stop."""
    params = {
        "format": "text", "COMMAND": "'301'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
        "START_TIME": f"'{start:%Y-%m-%d %H:%M}'", "STOP_TIME": f"'{stop:%Y-%m-%d %H:%M}'",
        "STEP_SIZE": f"'{step_h} h'", "QUANTITIES": "'14,15,20'", "ANG_FORMAT": "'DEG'",
        "RANGE_UNITS": "'KM'", "CSV_FORMAT": "'YES'", "CAL_FORMAT": "'CAL'",
        "TIME_DIGITS": "'MINUTES'",
    }
    req = urllib.request.Request(
        API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "python-urllib"}
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                text = r.read().decode()
            break
        except OSError:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    if "$$SOE" not in text:
        raise RuntimeError("Horizons returned no ephemeris:\n" + text[-1500:])
    if "MOON_ME" not in text:
        raise RuntimeError("Horizons no longer reports the MOON_ME frame")
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        f = [c.strip() for c in line.split(",")]
        # date, solar flag, lunar flag, 14 lon, 14 lat, 15 lon, 15 lat, delta, deldot
        when = datetime.strptime(f[0], "%Y-%b-%d %H:%M").replace(tzinfo=UTC)
        rows.append((when, float(f[5]), float(f[6]), float(f[3]), float(f[4]), float(f[7])))
    return rows


def check_rows(rows: list[tuple], start: datetime, step_h: int = 1) -> None:
    """Sanity: no gaps, physically plausible values (raises AssertionError)."""
    for i, r in enumerate(rows):
        assert r[0] == start + timedelta(hours=i * step_h), f"time gap at row {i}: {r[0]}"
        assert abs(wrap_lon_deg(r[1])) < 8.5 and abs(r[2]) < 7.5, f"sub-Earth out of range: {r}"
        assert abs(r[4]) < 1.7, f"sub-solar latitude out of range: {r}"
        assert 0 <= r[3] < 360 and 350000 < r[5] < 410000, f"bad row: {r}"


def fetch_table(start: datetime, stop: datetime, step_h: int = 1) -> EphemerisTable:
    """Hourly table for start <= t < stop, one calendar year per request (UTC datetimes)."""
    rows, a = [], start
    while a < stop:
        b = min(datetime(a.year + 1, 1, 1, tzinfo=UTC), stop)
        rows += fetch_chunk(a, b - timedelta(hours=step_h), step_h)  # Horizons includes stop
        a = b
    check_rows(rows, start, step_h)
    return _from_columns(
        start, step_h * 3600, [r[3] for r in rows], [r[4] for r in rows],
        [r[1] for r in rows], [r[2] for r in rows], [r[5] for r in rows],
    )
