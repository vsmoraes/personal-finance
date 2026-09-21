# Personal Finance

[![CI](https://github.com/vsmoraes/personal-finance/actions/workflows/ci.yml/badge.svg)](https://github.com/vsmoraes/personal-finance/actions/workflows/ci.yml)
[![Release](https://github.com/vsmoraes/personal-finance/actions/workflows/release.yml/badge.svg)](https://github.com/vsmoraes/personal-finance/actions/workflows/release.yml)

A private, single-profile finance app for transactions, budgets, forecasts, reports, and CSV imports. It keeps every amount in its original currency—there is no exchange-rate conversion.

The UI is React, TypeScript, and Ant Design. The API is Fastify, the database is SQLite, and the API contracts are generated from Protobuf.

> **No built-in authentication.** Run it locally or behind a trusted VPN/reverse proxy. Do not expose it directly to the public internet.

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
docker compose -f docker-compose.synology.yml up -d
```

Use a pinned version tag for upgrades. Keep the NAS port private and place Synology Reverse Proxy or a VPN in front of the app.

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

Pull requests and pushes to `main` run the same dependency-aware pipeline: contracts; formatting/lint/types and audit; unit, integration, and E2E tests in parallel; production build; then Docker persistence checks. The browser suite uses one desktop and one generic mobile project, with a ten-second per-test timeout.

Dependabot runs daily for npm and GitHub Actions updates. Patch and minor updates can be auto-merged after CI passes.

## License

No license has been selected yet.
