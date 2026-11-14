Status: WARNINGS

Scan date: 2026-11-14 (first scan, before implementation). Scanned: spikes/V2-rendering (pnpm lockfile, 453 packages), spikes/V1-data-ephemeris (Python venv, 12 packages; node/ folder with astronomy-engine, 16 packages), the toolchain on this machine, and the latest releases of the planned additions. No project-level lockfile exists yet.

## Findings (most severe first)

| Tool and version | Advisory | Severity | What could happen | Exposed? | Action |
|---|---|---|---|---|---|
| Node.js 24.22.0 (carries into project) | [Oct 2026 release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): CVE-2026-111497 (Brotli decoder memory write, could run attacker code), plus CVE-2026-105482, -105483, -106069 (DNS/TLS name-check bypasses), 4 more medium/low | High | A malicious Brotli-compressed response handled by Node could crash it or run code. Several TLS checks could accept a certificate for the wrong server. Press reports say the Brotli flaw is being exploited (CISA list); I did not confirm that on a primary source. | Partly. Vite dev server is localhost only, and the spikes only talk to known servers. Risk is when Node fetches over the network (ephemeris fetch, Playwright runner, `pnpm install`). | Upgrade to 24.22.3 (this also covers the item below). |
| Node.js 24.22.0 | [Nov 2026 release](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases): 16 issues (7 high, in HTTP/2, TLS, llhttp), e.g. CVE-2026-123864, CVE-2026-126051 | High | Remote crash or memory errors in Node's HTTP/2 and TLS servers or clients. | Mostly no: we run no public Node server, and the shipped site is static. Applies if the dev server is ever bound to a public address. | Upgrade to 24.22.3. |
| image-size 0.7.4 (spike V2, via deck.gl > loaders.gl > texture-compressor; will carry) | [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | High | A crafted ICNS image sends it into an endless loop (freeze). | Low. Only triggered by untrusted ICNS files, which SELENE never loads. May end up inside the bundle but is not called. | Wait for a deck.gl / loaders.gl release that updates texture-compressor, or add a pnpm override to image-size >=2.0.3 and test. Fix is not urgent. |
| fflate 0.7.4 (spike V2, via loaders.gl; will carry) | [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) | Moderate | A malformed ZIP64 archive makes unzip loop forever (freeze). | Low. We load no untrusted ZIP files. | Override to fflate >=0.7.5 or wait for loaders.gl update. |
| pip 24.0 (spike V1 venv; will carry unless upgraded) | OSV: [GHSA-qwm4-qh6w-59xr](https://github.com/advisories/GHSA-qwm4-qh6w-59xr), [GHSA-wf93-45jw-7689](https://github.com/advisories/GHSA-wf93-45jw-7689), [GHSA-jp4c-xjxw-mgf9](https://github.com/advisories/GHSA-jp4c-xjxw-mgf9), [GHSA-58qw-9mgm-455v](https://github.com/advisories/GHSA-58qw-9mgm-455v), [GHSA-4xh5-x5gv-qwph](https://github.com/advisories/GHSA-4xh5-x5gv-qwph), [GHSA-6vgw-5pg2-w6jp](https://github.com/advisories/GHSA-6vgw-5pg2-w6jp) | Moderate (5), Low (1) | pip could write files outside the install folder when installing a malicious or tampered package archive. | Low to moderate. Only matters when installing packages, from PyPI only. | `python -m pip install -U pip` in the venv (needs 26.2.0 or newer). |
| Chromium 158.0.8127.18 (Playwright build, dev/test only) | Chrome 157 zero-day [CVE-2026-125350](https://www.malwarebytes.com/blog/bugs/2026/11/update-chrome-now-to-fix-a-flaw-attackers-are-exploiting) (exploited in the wild, fixed in 157.0.8103.50) | High | A malicious web page could run code in the browser. | Low. The build is newer than the fixed 157 build, so it very likely contains the fix. Playwright should open only our own local pages, never other sites. | None; keep Playwright browsing to localhost only. |

Clean (no advisory in OSV for these exact versions): deck.gl 9.4.1, luma.gl 9.4.2, h3-js 4.5.0, vite 8.3.8, typescript 7.0.2, playwright 1.65.0, astronomy-engine 2.1.19, rasterio 1.5.2 (GDAL 3.12.2 bundled in the wheel; OSV has no entry for rasterio, GDAL itself not checked separately), numpy 2.5.4, requests 2.34.2, urllib3 2.8.0, certifi 2026.10.23, idna 3.20, charset-normalizer 3.5.2, click 8.5.1, pyparsing 3.3.3, affine 3.0.1, attrs 26.1.0. `pnpm audit` on V1 node/: 0 issues. No 2026 compromise reports found for deck.gl, vite, playwright, zustand, katex, echarts (a general search; the 2026 npm incidents it found, axios, keyv, TanStack, Shai-Hulud waves, do not involve our packages; their transitive use here was not checked).

## Planned additions: current latest stable (all return no OSV advisory)

react 19.3.1, react-dom 19.3.1, zustand 5.1.0, tailwindcss 4.3.5, echarts 6.1.0, react-markdown 10.1.0, remark-math 6.0.0, rehype-katex 7.0.1, katex 0.19.1, vitest 5.1.0, numba 0.68.1, h3 (Python) 4.5.0, pillow 13.0.0, jsonschema 4.26.0, pytest 9.2.0, ruff 0.17.5. Note: the OSV batch for these used the PyPI names and versions for the Python ones; the npm ones were only checked by version lookup, not yet against OSV (rerun once they are in a lockfile with `pnpm audit`).

## Other toolchain

- pnpm: installed 12.18.0 (not 12.14.0 as briefed; spikes pin 12.18.0), equals latest on npm. No advisory looked up beyond that.
- npm 11.19.1, Python 3.12.3, git 2.43.0, gh 2.45.0: Ubuntu packages, no advisory check done (see below).
- Note: spike package.json files use `devEngines` with `onFail: download`, so any pnpm run in them can download a pnpm binary. Fine now; keep the same pin in the project.

## Could not check

- Claude Code plugins `ponytail` (installed 5.3.2, from the local plugin cache) and `easel`: could not check, no primary source found. `easel` is not in the plugin install list on disk, only ponytail is.
- agy 1.4.3 (Antigravity CLI): no primary security source found.
- git 2.43.0 and gh 2.45.0: Ubuntu builds with backported fixes, so the upstream version number does not show whether they are patched. No Ubuntu notice checked.
- Python 3.12.3 (Ubuntu): same backport caveat.
- Chromium: no primary release note found for 158.0.8127.18 itself; the "contains the fix" statement is inferred from the version number.
- Playwright and Vite: no vendor security page was fetched; only OSV (clean).
- pip-audit not run (not installed); OSV used instead.
- Install-script risk: not inspected for the spikes' dependencies.
