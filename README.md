# Personal Finance

[![CI](https://github.com/vsmoraes/personal-finance/actions/workflows/ci.yml/badge.svg)](https://github.com/vsmoraes/personal-finance/actions/workflows/ci.yml)
[![Release](https://github.com/vsmoraes/personal-finance/actions/workflows/release.yml/badge.svg)](https://github.com/vsmoraes/personal-finance/actions/workflows/release.yml)

A private finance app for transactions, budgets, forecasts, reports, and CSV imports. It keeps every amount in its original currency—there is no exchange-rate conversion.

The UI is React, TypeScript, and Ant Design. The API is Fastify, the database is SQLite, and the API contracts are generated from Protobuf.

Sign-in uses Google Identity Services and a server-side session. For internet access, terminate HTTPS at a trusted reverse proxy and set `APP_ORIGIN` to its public HTTPS origin.

## Try it with Docker

Requires Docker Engine and Compose.

```sh
mkdir -p data
sudo chown 1000:1000 data       # Linux hosts
docker compose up --build -d
```

Open <http://localhost:8080>. Check the service with:

```sh
curl --fail http://localhost:8080/readyz
```

The database is stored at `./data/finance.db`, outside the container. Removing or updating the image does not remove your data. Keep the `data/` directory and back it up.

Copy `.env.example` to `.env` and set `GOOGLE_CLIENT_ID` to your web client ID. `.env` is ignored by git. In Google Cloud Console, configure these exact Authorized JavaScript origins for local development: `http://localhost:8080`, `http://127.0.0.1:8080`, and (if running Vite) `http://127.0.0.1:5173`. This implementation uses the GIS popup callback, so no Authorized redirect URI is needed. Set `APP_ORIGIN` to the exact browser origin you use when deploying; configure that same HTTPS origin as an Authorized JavaScript origin. The production origin cannot be listed here until its actual HTTPS URL is supplied. A Google OAuth client secret is **not** an origin and is not needed for this flow; rotate any secret accidentally shared.

## Develop locally

Use the Node version in `.nvmrc` (Node 24) and the pnpm version declared in `package.json`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

In a second terminal, start the Vite frontend:

```sh
pnpm dev:web
```

Open <http://localhost:5173>. Vite proxies API requests to port 8080.

Useful commands:

| Command                                  | Purpose                                                     |
| ---------------------------------------- | ----------------------------------------------------------- |
| `make verify`                            | Contracts, lint, types, tests, integration tests, and build |
| `make test`                              | Fast unit and component suite                               |
| `make test-integration`                  | API and SQLite integration tests                            |
| `make e2e`                               | Desktop and generic mobile Playwright tests                 |
| `make build-docker`                      | Build the local image                                       |
| `make up` / `make down`                  | Start or stop Compose                                       |
| `make logs`                              | Follow application logs                                     |
| `ENVIRONMENT=development make seed-demo` | Add synthetic 2025–2026 data locally                        |

Demo seeding is development-only. Production startup never loads demo data.

## Deploy to Synology

Releases are published manually from GitHub. Create a `vX.Y.Z` tag, create a GitHub release for that tag, and publish it. The release workflow pushes `linux/amd64` and `linux/arm64` images to GHCR.

On the NAS:

```sh
mkdir -p /volume1/docker/personal-finance/data
chown 1000:1000 /volume1/docker/personal-finance/data
chmod 700 /volume1/docker/personal-finance/data

export FINANCE_IMAGE=ghcr.io/OWNER/personal-finance
export FINANCE_TAG=v1.2.3
export SYNOLOGY_DATA_DIR=/volume1/docker/personal-finance/data
export APP_ORIGIN=https://your-actual-finance-domain.example
export GOOGLE_CLIENT_ID=your-google-web-client-id
docker compose -f docker-compose.synology.yml up -d
```

Use a pinned version tag for upgrades. Keep the NAS port private and place Synology Reverse Proxy or a VPN in front of the app.

`GOOGLE_CLIENT_ID` is required via the environment; it is never hard-coded in tracked source. The browser must receive this public OAuth client identifier to render the Google Identity Services button, so it cannot be kept secret from a visitor. Google ID tokens are never persisted or logged. `APP_ORIGIN` is required for production and must match the browser's HTTPS origin. `DATABASE_URL` controls the persisted SQLite file; `DATABASE_DRIVER=turso`, `DATABASE_URL`, and `TURSO_AUTH_TOKEN` can select the existing Turso option. No Google client secret, API scopes beyond identity, or external auth service is required. Session tokens are random, stored only as hashes in the database, and sent as Secure (for HTTPS), HttpOnly, SameSite=Strict cookies. Keep the data directory private and backed up.

Fastify writes structured server and request logs to stdout. Look for its `Server listening at` log followed by `Application ready to receive requests`. Startup errors are logged with the original error by Fastify; configuration or database errors that occur before Fastify is created are written to stderr. `/readyz` is the operational database readiness check. These logs appear only when the Node entrypoint (`pnpm start` or `apps/api/src/main.ts`) actually runs.

This repository is currently packaged for a long-running Docker server, not as a Vercel Function. Vercel's Fastify auto-detection requires a recognized entrypoint name at the project root or under `src/`; this repo's runnable entrypoint is `apps/api/src/main.ts`. A Vercel deployment needs its own entrypoint/build configuration, and its ephemeral filesystem cannot persist the default SQLite database. Use the existing Turso driver (or another persistent database) for that deployment. If Vercel shows only `Application exited with code 1` and none of the startup messages above, check that it is actually invoking this server entrypoint.

All signed-in users share the same resources and settings. The migration creates a `system` user and attributes existing records to it; new records store their creator's internal user ID and creation time. Legacy creation times are copied from record payloads where available; otherwise the migration time is recorded. No per-user access restriction or ownership claim is inferred from the old data.

All finance API routes require a valid session. The minimal sign-in bootstrap (`/api/v1/auth/config`, `/api/v1/auth/csrf`, `/api/v1/auth/google`) must be reachable before authentication; `/healthz` and `/readyz` remain data-free operational probes. Unauthenticated visitors see only the login page. There is no unauthenticated finance data access.

## Data and backups

SQLite lives on the host/NAS bind mount at `/data/finance.db` inside the container. WAL files (`-wal` and `-shm`) are part of the database state. Keep the database on local storage, not a network share.

For a full backup, stop the container and copy the database together with any WAL and shared-memory files, or use SQLite’s online backup API. JSON export is useful for moving financial records, but it is not a complete database backup.

Migrations run automatically at startup and are checksum-protected. Never edit an applied migration.

## How the app works

- Transactions, budgets, recurring commitments, and what-if plans each retain their own currency.
- Overview and Transactions share the same entry drawer.
- Reports show one selected currency at a time; values in different currencies are never added together.
- CSV imports validate and preview data before an atomic confirmation. Repeating the same import is safe.
- Settings include language, date formats, light/dark/custom themes, and import defaults.

## Project layout

```text
apps/api        Fastify API and HTTP adapters
apps/web        React + Ant Design application
packages/domain Financial rules and money arithmetic
packages/application Use cases and orchestration
packages/database SQLite adapter and migrations
packages/contracts Generated Protobuf messages
tests           Unit, integration, and Playwright tests
```

The API composition root is [`apps/api/src/app.ts`](apps/api/src/app.ts). See the [architecture guide](docs/architecture.md), [API guide](docs/api.md), [OpenAPI document](docs/openapi.json), and [requirements](docs/REQUIREMENTS.md) for deeper reference.

## CI and releases

Pull requests and pushes to `main` run the same dependency-aware pipeline: contracts; formatting/lint/types and audit; unit, integration, and E2E tests in parallel; production build; then Docker persistence checks. The browser suite uses one desktop and one generic mobile project, with a thirty-second per-test timeout.

Dependabot runs daily for npm and GitHub Actions updates. Once CI passes, any
open Dependabot pull request to `main` is squash-merged directly; an approval
is not required. The `DEPENDABOT_AUTOMERGE_TOKEN` repository secret must have
contents and pull-request write access and be allowed to bypass `main` branch
protection rules.

## License

No license has been selected yet.
