Status: WARNINGS

Scan date: 2026-11-15 (main at 1705c71, pre-merge scan of `feat/W7-apollo-docs` at ab3c325). The web lockfile scanned this time is the one from the W7 BRANCH worktree (`.claude/worktrees/agent-abf7847316c1786d8/web/pnpm-lock.yaml`, 408 dependency entries, 774 package lines), not main's. Scanned: `pnpm audit`, plus OSV batch for every package+version in that lockfile (408 queries, one batch). Python (`requirements.lock`) not rescanned (unchanged since 2026-11-14). Spikes not scanned.

Verdict on merging W7: ACCEPTABLE. No high or critical finding, no malicious package, no install scripts among the added packages.

## Findings (most severe first)

| Tool and version | Advisory | Severity | What could happen | Exposed? | Action |
|---|---|---|---|---|---|
| Node.js 24.22.0 (still installed) | [Oct 2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) and [Nov 2026](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases) Node releases | High | A crafted network response could crash Node or, for the Brotli flaw, run attacker code. | Only if something runs on 24.22.0. Agents and `nvm use` in the repo give 24.22.3 (fixed; confirmed in the worktree). Static site not affected. Re-check: nvm default alias is `lts/*`, which resolves to nothing installed (latest LTS is 26.13.1), so a plain shell would not silently pick 24.22.0. | `nvm alias default 24.22.3`, then uninstall 24.22.0. |
| katex 0.16.47 (NEW with W7; transitive via remark-math and rehype-katex, runtime, ships in the site) | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) (pnpm audit 1241206, CWE-807) | Low | If some other flaw lets an attacker pollute JavaScript's base object, KaTeX would treat formulas as trusted and could emit dangerous links. KaTeX itself does not create that flaw. | No. The only formulas rendered come from the repo's own docs (imported at build time as text), `trust` is not enabled, no user input reaches the renderer, and no prototype-pollution source exists. Note: the direct katex 0.19.1 (fixed, not in OSV) is also installed, but rehype-katex 7.0.1 pulls its own 0.16.47 for rendering. | Optional: add a pnpm override `katex: 0.19.1` (or >=0.18.2) and test formula rendering, or wait for a rehype-katex/remark-math release using katex >=0.18.2. |
| minimatch 10.2.6 (via typescript-eslint, dev-only) | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (id 1244623, CWE-405) | Moderate | A crafted file pattern makes minimatch burn CPU (freeze). | No. Linter only, our own patterns, never in the built site. Unchanged: still 10.2.6, still no patched parent. | None now. Wait for typescript-eslint using minimatch >=11.0.1, or override and test. |
| pip 24.0 (old spike venv) | [GHSA-qwm4-qh6w-59xr](https://github.com/advisories/GHSA-qwm4-qh6w-59xr) and 5 more (previous scan) | Moderate | pip could write files outside its folder when installing a tampered package. | Low. Not rechecked today. | In the project venv: `python -m pip install -U pip`. |

## W7 specific checks

- New direct packages react-markdown 10.1.0, remark-math 6.0.0, remark-gfm 4.0.1, rehype-katex 7.0.1, katex 0.19.1: no OSV advisory for any of them. The whole lockfile gave exactly two OSV hits (katex 0.16.47, minimatch 10.2.6), matching `pnpm audit` (1 low, 1 moderate, 0 high, 0 critical).
- Install scripts: the lockfile has zero `requiresBuild` entries, so none of the 118 added packages runs code at `pnpm install`. The branch changes `pnpm-workspace.yaml` not at all (overrides only), and `package.json` only adds the five dependencies.
- Compromise reports (web search, 2026): none found for react-markdown, remark/rehype/micromark/unified/syntax-tree, katex. Unrelated 2026 npm campaigns exist (Mini Shai-Hulud, Miasma, node-ipc). One lookalike, `remark-gfm-v4` (flagged malicious Feb 2026 by an aggregator, not a primary source), is NOT in the lockfile; the real name `remark-gfm` is used.
- Rendering exposure: ApolloView renders only the repository's own `docs/*.md` (imported with `?raw`), no `rehype-raw`, no `allowDangerousHtml`, so raw HTML passthrough is off and no outside text is rendered. The XSS-type risks of this stack therefore do not apply today. If the app ever renders user-supplied or fetched Markdown, re-evaluate (katex finding then matters).

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
- Install scripts checked only via `requiresBuild` flags in the lockfile (none). pip-audit not run. Python scan not repeated.
- Compromise search was two general queries, not one per package; aggregator results are not primary sources.
- Whether this repo's Markdown files themselves contain raw HTML was not reviewed (irrelevant while only own docs are rendered).
