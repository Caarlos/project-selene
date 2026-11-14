# SELENE

Selenographic Exploration & Lunar Environment Navigation Engine. Specification: `PLAN.md`.

## Quick start

Needs Python 3.12+, Node 24.22.3 (`.nvmrc`) and pnpm 12.18.0.

```sh
# pipeline
python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r requirements.lock -e '.[dev]'
.venv/bin/ruff check .
.venv/bin/pytest

# placeholder scenario for the web app (synthetic; already committed)
.venv/bin/python -m pipeline.fixture
.venv/bin/python -m pipeline.schema.validate web/public/data/fixture

# web app
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev          # http://127.0.0.1:5173
pnpm --dir web typecheck
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web build
```
