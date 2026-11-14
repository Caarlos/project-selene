Status: WARNINGS

Scan date: 2026-11-14 (post-T0, main at f97f167). Scanned: `web/pnpm-lock.yaml` (290 packages, `pnpm audit`), `requirements.lock` (22 pinned Python packages) and the 24 direct web dependencies (OSV, 46 exact name+version queries in one batch), plus the toolchain. Spikes (`spikes/`) are throwaway and git-ignored: not re-scanned this time, earlier findings no longer apply to the project.

## Findings (most severe first)

| Tool and version | Advisory | Severity | What could happen | Exposed? | Action |
|---|---|---|---|---|---|
| Node.js 24.22.0 (still installed, may be the default in some shells) | [Oct 2026 release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) (e.g. CVE-2026-111497, Brotli memory write) and [Nov 2026 release](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases) (16 issues in HTTP/2, TLS, llhttp) | High | A crafted network response could crash Node or, for the Brotli flaw, run attacker code. Some TLS checks could accept the wrong certificate. | Only if something runs on 24.22.0. Agents use 24.22.3 (fixed) via a PATH prefix. The static site itself is not affected. | Switch the default to 24.22.3 (see note below), then remove 24.22.0. |
| minimatch 10.2.6 (via typescript-eslint, dev-only) | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (pnpm audit id 1244623, CWE-405) | Moderate | A specially built file-pattern makes minimatch use huge CPU (freeze). | No. It runs only inside the linter on our own patterns, never in the built site or on user input. Confirmed dev-only by pnpm audit. | None now. Wait for a typescript-eslint release using minimatch >=11.0.1, or add a pnpm override and test. |
| pip 24.0 (old spike venv; will carry if a project venv reuses it) | [GHSA-qwm4-qh6w-59xr](https://github.com/advisories/GHSA-qwm4-qh6w-59xr) and 5 more (see previous scan) | Moderate | pip could write files outside its folder when installing a tampered package. | Low. Only when installing, from PyPI only. I did not check which pip the project venv will use. | In the project venv: `python -m pip install -U pip` (26.2.0 or newer). |

Clean: no advisory in OSV for any of the 46 exact versions queried, and `pnpm audit` shows only the minimatch item (0 high, 0 critical). That covers typescript 6.0.3, react and react-dom 19.3.1, zustand 5.1.0, echarts 6.1.0, tailwindcss and @tailwindcss/vite 4.3.5, vitest 5.1.0, eslint 10.15.0, typescript-eslint 8.72.2, @vitejs/plugin-react 6.3.0, @deck.gl/core, layers, react, widgets 9.4.1, h3-js 4.5.0, astronomy-engine 2.1.19, vite 8.3.8, playwright 1.65.0, and Python numba 0.68.1, llvmlite 0.50.0, numpy 2.5.4, pillow 13.0.0, jsonschema 4.26.0, pytest 9.2.0, ruff 0.17.5, rasterio 1.5.2, h3 4.5.0 and the rest of the lock. Transitive web packages were covered only by `pnpm audit`, not by OSV.

## Toolchain inventory

- Node 24.22.3 (agents), pnpm 12.18.0 (pinned in `web/package.json`; `engines.node >=24.22.3` is good), Python 3.12.3, git 2.43.0, gh 2.45.0, agy 1.4.3.
- Playwright Chromium: Chrome for Testing 158.0.8127.18 (chromium-1254), dev/test only, newer than the fixed 157 build for CVE-2026-125350. Keep Playwright on localhost pages only.
- Claude Code: `ponytail` plugin (5.3.2); project agents in `.claude/agents`. Two extra copies of the project exist under `.claude/worktrees/` (agent worktrees, same lockfiles, not scanned separately).
- Note on Node default: `~/.nvm/alias/default` is `lts/*`; both 24.22.0 and 24.22.3 are installed, and a clean shell without nvm loaded has no node at all. I could not reproduce the 24.22.0 default you saw, but because it can happen, run `nvm alias default 24.22.3` (not done by me) and uninstall 24.22.0 once nothing needs it. Yes, the default should be switched.

## Could not check

- Plugins `ponytail` and `easel` (MCP server): no primary security source found.
- agy 1.4.3: no primary security source.
- git 2.43.0, gh 2.45.0, Python 3.12.3: Ubuntu builds with backported fixes, so the version number does not show patch state; no Ubuntu notice checked.
- Chromium 158.0.8127.18: "contains the fix" inferred from the version number.
- Vendor security pages for Playwright, Vite, pnpm: not fetched; OSV and pnpm audit only.
- Recent-compromise web search per direct dependency: not repeated this run (kept light); the previous scan found no 2026 incident involving our packages.
- Install-script risk (`pnpm install` lifecycle scripts) not inspected. pip-audit not run.
