# Personal Finance

A single-profile personal finance application with exact multi-currency accounting, monthly and annual reports, budgets, forecasts, configurable categorization rules, and atomic CSV imports. React and Ant Design run behind a Fastify API backed by SQLite. REST messages are generated from Protobuf.

**This application deliberately has no authentication. Use it locally or on a trusted private network. Never expose it to the public internet without an authenticated reverse proxy, VPN, or equivalent external access control.** There are no accounts, sessions, roles, or savings-account workflows. Net savings is the calculated difference between income and expenses.

## Run with Docker

Prerequisites: Docker Engine and Docker Compose. The container listens on port 8080; Compose binds to host loopback by default.

```sh
mkdir -p data
# Linux: the non-root container account must own this directory.
sudo chown 1000:1000 data
chmod 700 data
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8080/healthz
curl --fail http://localhost:8080/readyz
```

Open **http://localhost:8080**. All data lives in `./data/finance.db`; replacing the image does not replace the database. On Docker Desktop, host-directory ownership is normally translated automatically. On Linux, either use the ownership above or set `FINANCE_UID` and `FINANCE_GID` in `.env` to the owner of `./data`. Never run the application as root to bypass a permissions error.

The filesystem is read-only except `/data` and a size-limited `/tmp`. The container runs as a non-root account, drops capabilities, checks readiness, restarts automatically, and handles SIGTERM gracefully. Use `docker compose down` to stop it; keep `./data`.

## Local development

Use the Node 24 active LTS line; the tested runtime is pinned in `.nvmrc` and Dockerfile. Corepack resolves the pinned pnpm version from `package.json`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
# In a second terminal:
pnpm dev:web
```

Open http://localhost:5173. Vite proxies `/api` to port 8080. For a production build without Docker:

```sh
pnpm build
pnpm start
```

The repository also exposes the common workflows through a Makefile:

```sh
make install       # install the locked dependencies
make verify        # contracts, formatting, lint, types, tests, and build
make verify-fast   # focused PR checks without coverage or heavy integration suites
make test          # Vitest with coverage
make test-fast     # focused unit/component checks
make e2e-install   # install Playwright browsers once
make e2e           # Playwright browser suite
make e2e-fast      # one desktop smoke flow
make build-docker  # build the local image
make build-synology PLATFORM=linux/amd64 TAG=v1.2.3
make up            # start the local Compose stack
make down          # stop it
make logs          # follow API logs
```

Set `IMAGE=ghcr.io/OWNER/personal-finance` when building an image for a
registry; the default image name is the local `personal-finance`.

`make seed-demo` is deliberately guarded. It only runs when invoked as
`ENVIRONMENT=development make seed-demo`; there is no production seed target and
the production image never runs the seed script.

## Deploy on a Synology NAS

The release workflow publishes multi-architecture images to GitHub Container
Registry when a GitHub release is manually published with a `vX.Y.Z` tag.
Synology Container Manager can pull that image directly. For a Compose-based deployment, copy
[`docker-compose.synology.yml`](docker-compose.synology.yml) to the NAS and
create a directory such as `/volume1/docker/personal-finance/data` before the
first start:

```sh
mkdir -p /volume1/docker/personal-finance/data
# The image runs as UID/GID 1000 by default; grant that account access to the bind mount.
chown 1000:1000 /volume1/docker/personal-finance/data
chmod 700 /volume1/docker/personal-finance/data
export FINANCE_IMAGE=ghcr.io/OWNER/personal-finance
export FINANCE_TAG=v1.2.3
export SYNOLOGY_DATA_DIR=/volume1/docker/personal-finance/data
docker compose -f docker-compose.synology.yml up -d
docker compose -f docker-compose.synology.yml ps
curl --fail http://127.0.0.1:8080/readyz
```

Replace `OWNER` with the GitHub owner or organization and authenticate the NAS
to GHCR first if the repository is private (`docker login ghcr.io`). The image
supports `linux/amd64` and `linux/arm64`; choose the matching architecture when
building privately with `make build-synology PLATFORM=...`.

Keep the NAS port private and put Synology Reverse Proxy, an authenticated VPN,
or another access-control layer in front of it. This application has no built-in
authentication. Back up the data directory before upgrades and test a restore.

### Database and persistent storage

The API uses SQLite. The database file, its write-ahead log (`finance.db-wal`),
shared-memory file (`finance.db-shm`), migrations, audit history, and imports
are managed through the application database layer. The container filesystem is
read-only; only `/data` is writable. The Compose bind mount maps the NAS
directory to `/data`, and `DATABASE_URL=file:/data/finance.db` points SQLite at
that external location. Replacing or pulling a new image therefore leaves the
database untouched.

SQLite migrations run at startup inside an immediate transaction and are
checksum-protected. Never edit an applied migration. Keep the database on the
NAS local volume rather than a network-mounted share because SQLite WAL locking
is not reliable over shared filesystems. Stop the container before moving or
restoring the database, and move the database together with any `-wal` and `-shm`
files. Use SQLite's online backup API for live backups; JSON export is not a
full database backup.

Production deployments contain no demo data. A new production database starts
with generic categories and settings only. Demo data is available exclusively
through the development-only `ENVIRONMENT=development make seed-demo` workflow;
never run it against the NAS data directory.

Only `apps/api/src/app.ts` composes infrastructure adapters. Financial logic can be exercised without starting HTTP. See [architecture](docs/architecture.md), [API guide](docs/api.md), [generated OpenAPI](docs/openapi.json), and the [verification record](docs/verification.md).

The maintained product source of truth is [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md), including the refined UI, currency, deployment, testing, and security decisions made during implementation.

## Configure and use

1. Choose language, default currency, timezone, theme, report year, and import defaults in **Settings**. The initial default currency is EUR. Changing it only changes entry/report defaults; existing entries keep their original amounts and currencies.
2. Use **Add transaction** on Overview or Transactions to open the shared entry drawer and record positive amounts in the selected currency. Income/expense determines direction. No exchange rates or converted amounts are required or calculated.
3. Manage category defaults and display order in **Categories**. An empty default budget means no budget; `0` means a zero budget. Archived categories remain on historical transactions. Restore them by editing the archived flag.
4. Add budget overrides with a start and optional end month. The most recent applicable start month wins. Default budgets are the fallback; recurring commitments marked to contribute are added. The budget copy tool accepts individual target months or a source and destination year.
5. Add recurring commitments for expected income or expenses. **What-if plans** (formerly Scenarios) replace a month's expected category amount, or add one-time amounts, without changing transactions or budgets. For example, preview a salary increase or a one-off expense, then select that plan on Forecast to compare the outcome. Completed months show actuals; current and future months use the greater of recorded and expected amounts per category, avoiding double counting already recorded commitments. Year-end net savings is forecast income minus forecast expenses.
6. Rules run in ascending priority, with ID as a stable tie-breaker. Conditions are combined with AND; text matches are case-insensitive substrings. Set identical minimum and maximum minor units for an exact amount. Amount rules require a currency. The first match wins unless continuation is enabled. Preview explains the conditions matched. Manual categories are preserved unless the explicit overwrite option is selected.
7. Transaction history supports filters, sorting, pagination, editing, deletion confirmation, bulk categorization, rule reapplication, and CSV/JSON export.

Budgets, recurring commitments, and scenario overrides each carry their own currency. Choose **Report currency** to view totals for a single currency; amounts in different currencies are never added together. Budget variance applies only to budgeted categories and transactions included in budgeting. Total expenses and net savings always include all expenses. This preserves the specified distinction between an absent budget and a zero budget. A zero-income savings rate is shown as not applicable. Charts receive only report detail rows: exactly twelve monthly rows, with totals kept separately.

## CSV import

Use **Import data**. Choose a CSV (maximum 2 MB, 10,000 data rows), enter a stable import source, then detect columns. Map date and amount plus optional type, category slug/name, currency, counterparty, note, and external ID. Choose ISO, day/month/year, or month/day/year dates and dot or comma decimals. UTF-8/UTF-16 BOMs and Windows-1252 fallback are supported. Comma, semicolon, and tab delimiters can be detected or selected.

Without a type column, negative amounts become expenses and positive amounts become income; stored amounts are always positive. Explicit type values are `income` or `expense`. Missing categories use generic income/expense fallbacks before applying configured rules. Preview again after any mapping change. Invalid rows remain visible; download their error report, fix the input, and preview again. Confirmation is atomic: all valid nonduplicate rows are inserted or none are. Reconfirming the same preview is idempotent. Import metadata and normalized rows stay in SQLite; raw uploaded files are not written to temporary storage.

Deduplication uses import source, external ID, date, original amount/currency, and normalized counterparty/note. CSV exports escape spreadsheet formula prefixes. JSON export includes financial resources and settings, but is not a database backup; use SQLite backups for a full restorable copy including audits and imports.

## Environment

| Variable                      | Default                  | Purpose                                                      |
| ----------------------------- | ------------------------ | ------------------------------------------------------------ |
| `DATABASE_URL`                | `file:./data/finance.db` | SQLite path; container uses `file:/data/finance.db`          |
| `HOST`                        | `127.0.0.1`              | API bind address; container uses `0.0.0.0`                   |
| `PORT`                        | `8080`                   | HTTP port; Compose uses it for the host port                 |
| `FINANCE_UID` / `FINANCE_GID` | `1000` / `1000`          | Compose process identity, matching host data ownership       |
| `NODE_ENV`                    | unset                    | Container sets `production`                                  |
| `E2E_BASE_URL`                | unset                    | Test an existing server instead of launching the test server |

## Database migrations and recovery

Startup enables foreign keys, WAL, and a five-second lock timeout, then runs checked-in SQL migrations in an immediate transaction. Migration checksums detect modifications to already-applied migrations. Never edit an applied migration. A missing database initializes with generic categories and settings; no personal values, merchants, rules, or scenarios are seeded. Keep the database on a local disk; WAL is not suitable for a shared network filesystem.

Back up a live container with SQLite's online backup API:

```sh
docker compose exec finance node --input-type=module -e 'import Database from "better-sqlite3"; const db=new Database("/data/finance.db"); await db.backup("/data/finance-backup.db"); db.close();'
```

Move the backup to encrypted storage outside the host. Verify it before relying on it:

```sh
docker compose exec finance node --input-type=module -e 'import Database from "better-sqlite3"; const db=new Database("/data/finance-backup.db", {readonly:true}); process.stdout.write(JSON.stringify(db.pragma("integrity_check"))); db.close();'
```

For restore, stop the container, move the current database **and its `-wal` and `-shm` files** together into a recovery directory, copy the verified backup to `data/finance.db`, restore directory/file ownership, and start the container. Do not copy only a live database file while leaving its WAL behind. Test restores periodically.

## Contracts and verification

```sh
pnpm proto:lint
pnpm proto:generate
pnpm proto:check
pnpm proto:breaking
pnpm api:generate
pnpm api:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:docker
pnpm audit --audit-level=high
```

Buf's dependency lock and pnpm's lockfile are checked in. `proto:check` regenerates and compares a content digest; CI fails on stale generated files. `proto:breaking` compares against the checked-in initial contract image. Do not replace the baseline to conceal breaking changes; introduce a new API version. Generated OpenAPI derives message schemas from Protobuf reflection and paths from the HTTP adapter; `api:check` prevents stale documentation.

## CI/CD and releases

Every push and pull request runs the Verify workflow. It installs the locked
toolchain, checks Protobuf and OpenAPI contracts, formatting, lint, types,
unit/integration/browser tests, the production build, dependency audits, and
the Docker persistence smoke test. The main workflow blocks on high-severity
dependency findings, while a scheduled Security workflow repeats the audit.

Dependabot is configured for daily npm and GitHub Actions updates. Patch and
minor Dependabot pull requests are grouped by dependency
type and marked for GitHub auto-merge after the normal CI checks pass. Major
updates remain manual review items. Because GitHub gives Dependabot workflows
a read-only token, configure a repository secret named
`DEPENDABOT_AUTOMERGE_TOKEN` with a fine-grained token that can write contents
and pull requests if automatic merging is desired; without it, the workflow
leaves updates for manual merging without failing CI.

To publish a release, create a semantic version tag such as `v1.2.3` and
choose **Draft a new release** in GitHub with that tag. Publishing the release
starts the image workflow. It pushes `linux/amd64` and `linux/arm64` images to
GitHub Container Registry with both the version tag and `latest`. Deploy a
specific version on Synology by changing `FINANCE_TAG`; do not deploy an
unpinned moving tag for a production upgrade.

Vitest covers financial arithmetic, reports, rules, imports, repository mappings, migrations, concurrency, HTTP behavior, and React flows with MSW. Playwright uses desktop, 320/360/390px mobile, tablet, and landscape profiles. Coverage is enforced in CI, including at least 90% statement and branch coverage for the financial domain. Docker smoke tests create a transaction, restart and recreate the container, then verify persistence.

## External access control

Keep the loopback port binding. Place an authenticated reverse proxy on the same host, or access the service through a VPN/SSH tunnel. For an SSH tunnel, forward a local port to the host's loopback `8080` and leave Compose unchanged. For an authenticated proxy, require authentication on **every path**, including `/api`, before forwarding traffic; pass the original Host header so same-origin checks match. Terminate TLS at the proxy and do not publish the application container independently. The application does not interpret proxy identity headers and cannot provide per-person isolation.

## Troubleshooting

- **Container restarts / cannot open database:** inspect `docker compose logs finance` and verify the `/data` bind mount is writable by the configured UID/GID. Application logs intentionally omit database paths and financial payloads.
- **Database busy:** retry after other writers finish. Do not run separate tools that hold write transactions open. Use the online backup API.
- **Conflict while saving:** another browser changed the record. Reload, inspect the latest value, and repeat the intended edit.
- **Currency amount rejected:** check the ISO currency and supported number of decimal places (e.g. no decimals for JPY, three for KWD).
- **Import cannot confirm:** inspect every row error. Confirming stale previews after category archival is rejected transactionally.
- **Contracts are stale:** run `pnpm proto:generate`, then `pnpm api:generate` and commit all resulting changes.
- **Native SQLite dependency fails to install:** use the pinned Node version; if a prebuilt binary is unavailable, install Python, make, and a C++ compiler before `pnpm rebuild better-sqlite3`.

## Optional demo data

Run `corepack pnpm seed:demo` to add synthetic 2025–2026 test data to `data/finance.db`.
**When using Docker Compose, stop the container before running this host command**, then restart it afterward:

```sh
docker compose stop finance
corepack pnpm seed:demo
docker compose up -d finance
```

Host and VM/container processes must not concurrently open a bind-mounted SQLite database; their file locks may not be shared.
Override `DATABASE_URL=file:/path/to/demo.db` to use another database. The command
uses the application use cases and SQLite transaction boundary, takes an online
backup before the first run, and is idempotent. It preserves settings and existing
records. The supplied dataset requires active built-in
expense categories; it fails atomically if those prerequisites are not met.
Normal startup never loads demo data.

The dataset contains 727 transactions from January 2025 through September 20, 2026,
including EUR, USD, GBP, BRL, JPY, and KWD; recurring commitments;
budgets through December 2026; categorization rules; confirmed and invalid-preview
imports; and three forecast scenarios. February 2025 deliberately has no income.
Custom categories cover zero budgets, missing budgets, excluded expenses, and archived
history. October–December 2026 remain available for forecast testing. On a fresh
database the seed creates 19 budget ranges, six commitments, five rules, and three
scenarios. Existing category budget configurations take precedence.

[CSV fixtures](fixtures/demo/README.md) exercise import rules, duplicates, and errors.

The React/TypeScript UI uses standard Ant Design layouts, typography, forms, controls,
tables, lists, and `@ant-design/icons`, with the default light/dark algorithms and no
custom component CSS. Recharts supplies the required financial charts using Ant Design
theme colors. React Hook Form owns form state and validation; Ant Form renders it.

## UI structure

Overview contains financial summaries, charts, budget status, and recent activity. Its **Add transaction** action opens the same drawer used by transaction history. The adjacent menu opens the shared category, budget, recurring-commitment, categorization-rule, or what-if-plan editor. Forms are not duplicated on the dashboard.

Transaction history uses an Ant Design table with income/expense tabs, search, currency and category filters, additional filters, pagination, row selection, bulk operations, and edit/delete actions. Other entry types use searchable management tables. Settings are grouped into General, Dates & reports, and Import defaults. Tables scroll within their cards on narrow screens; entry drawers occupy the mobile viewport. All layout, controls, and icons use Ant Design; charts use Recharts with Ant Design tokens.

Migration 0002 removes conversion from active records while preserving every original amount, currency, ID, and version. Existing manual rates are retained only in an unused archive table. The old v1 conversion descriptor fields are deprecated and ignored for wire compatibility. There is no exchange-rate screen or API endpoint.
