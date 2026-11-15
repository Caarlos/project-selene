"""Raw inputs of PLAN.md section 4 that v1 uses: download (opt-in) and checksum record.

Usage:
  python -m pipeline.fetch_data              record size + SHA-256 of the files present
  python -m pipeline.fetch_data --download   also fetch missing files (resumable, size checked)

Writes <raw dir>/SOURCES.json. Nothing is downloaded unless --download is given. The Diviner
GeoTIFF is derived from dlre_prp_south.zip by pipeline.hestia.ice.prp_zip_to_geotiff.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

from pipeline.hyperion.dem import data_raw_dir

PDS_POLAR = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/"
)
PGDA = "https://pgda.gsfc.nasa.gov/data/MoonIllumination/"
PRP = "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/extras/prp/"

# file -> (download url or None for derived files, what it is and who uses it)
CATALOG: dict[str, tuple[str | None, str]] = {
    "ldem_75s_120m.img": (PDS_POLAR + "img/ldem_75s_120m.img",
                          "LOLA elevation 75S-90S, 120 m/px, int16, height_m = DN x 0.5"),
    "ldem_75s_120m.lbl": (PDS_POLAR + "img/ldem_75s_120m.lbl", "label of ldem_75s_120m.img"),
    "ldem_80s_80m.jp2": (PDS_POLAR + "jp2/ldem_80s_80m.jp2",
                         "LOLA elevation 80S-90S, 80 m/px, int16 JPEG2000 without scale, height_m "
                         "= DN x 0.5 (ARGUS slopes; fallback for the 20 m product)"),
    "dlre_prp_south.zip": (PRP + "dlre_prp_south.zip",
                           "Diviner Polar Resource Product, ASCII table (Paige 2010)"),
    "diviner_prp_south_500m.tif": (None,
                                   "DERIVED from dlre_prp_south.zip by "
                                   "pipeline.hestia.ice.prp_zip_to_geotiff: 3 bands temp_avg_K, "
                                   "temp_max_K, ice_depth_m on a 1200 x 1200 grid of ~506.7 m "
                                   "(mean of the 2 triangles per square), nodata -999 (HESTIA)"),
    "LPSR_75S_120M_201608.TIF": (PGDA + "LPSR_75S_120M_201608.TIF",
                                 "LOLA permanently shadowed regions, 120 m, DN +20000 = shadow "
                                 "(HESTIA)"),
    "AVGVISIB_75S_120M_201608.TIF": (PGDA + "AVGVISIB_75S_120M_201608.TIF",
                                     "LOLA average Sun visibility, DN x 0.00004 (validation only)"),
    "AVGVISIB_75S_120M_201608_EARTH.TIF": (PGDA + "AVGVISIB_75S_120M_201608_EARTH.TIF",
                                           "LOLA average Earth visibility (validation only)"),
}


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dst: Path) -> None:
    """Resumable GET (Range), size checked against the server's length."""
    part = dst.with_name(dst.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
    with urllib.request.urlopen(req) as resp:  # noqa: S310 (fixed https URLs from CATALOG)
        resumed = resp.status == 206
        total = int(resp.headers["Content-Length"]) + (have if resumed else 0)
        with open(part, "ab" if resumed else "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
    if part.stat().st_size != total:
        raise OSError(f"{dst.name}: got {part.stat().st_size} bytes, expected {total}")
    part.rename(dst)


def record_checksums(raw: Path | None = None, fetch: bool = False) -> dict:
    """Update <raw>/SOURCES.json for every catalogue file present (hash reused when size and
    mtime are unchanged); with fetch=True missing downloadable files are fetched first."""
    raw = raw or data_raw_dir()
    sources_path = raw / "SOURCES.json"
    old = json.loads(sources_path.read_text()) if sources_path.exists() else {}
    out = {}
    for name, (url, note) in CATALOG.items():
        path = raw / name
        if not path.exists() and fetch and url:
            download(url, path)
        if not path.exists():
            continue
        st = path.stat()
        prev = old.get(name, {})
        same = prev.get("size_bytes") == st.st_size and prev.get("mtime_ns") == st.st_mtime_ns
        out[name] = {"name": name, "url": url, "note": note, "size_bytes": st.st_size,
                     "mtime_ns": st.st_mtime_ns,
                     "sha256": prev["sha256"] if same and "sha256" in prev else sha256_of(path)}
    sources_path.write_text(json.dumps(out, indent=2) + "\n")
    return out


def source_entry(name: str, raw: Path | None = None) -> dict:
    """{name, url, sha256} of one raw file for a manifest (url is the origin; for a derived file
    it is the URL of the file it was derived from)."""
    entry = record_checksums(raw)[name]
    url = entry["url"] or CATALOG["dlre_prp_south.zip"][0]
    return {"name": name, "url": url, "sha256": entry["sha256"]}


if __name__ == "__main__":
    for e in record_checksums(fetch="--download" in sys.argv).values():
        print(f"{e['sha256']}  {e['size_bytes']:>12}  {e['name']}")
