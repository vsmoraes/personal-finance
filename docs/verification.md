# Verification record

Verified on 2026-09-20 with Node 24.12.0, pnpm 10.17.1, Chromium 140, and Docker Compose 5.1.1. Commands below were executed from the repository root. `corepack pnpm` resolves the pinned package manager and is equivalent to `pnpm` after Corepack activation.

| Command                                                  | Result                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                | Passed in Docker builds; lockfile accepted without updates                                                                                                          |
| `corepack pnpm proto:lint`                               | Passed                                                                                                                                                              |
| `corepack pnpm proto:generate`                           | Passed; generated TypeScript includes validation descriptors                                                                                                        |
| `corepack pnpm proto:check`                              | Passed; regeneration preserved the source digest                                                                                                                    |
| `corepack pnpm proto:breaking`                           | Passed against checked-in initial contract baseline                                                                                                                 |
| `corepack pnpm api:generate`                             | Passed                                                                                                                                                              |
| `corepack pnpm api:check`                                | Passed; OpenAPI matches contracts and routes                                                                                                                        |
| `corepack pnpm format:check`                             | Passed                                                                                                                                                              |
| `corepack pnpm lint`                                     | Passed                                                                                                                                                              |
| `corepack pnpm typecheck`                                | Passed                                                                                                                                                              |
| `corepack pnpm test`                                     | 104 tests passed across six suites                                                                                                                                  |
| `corepack pnpm test:integration`                         | 31 integration tests passed using temporary SQLite databases                                                                                                        |
| `corepack pnpm build`                                    | Passed; compiled API and browser assets produced                                                                                                                    |
| `corepack pnpm test:e2e`                                 | 18 tests passed across six Chromium viewport/device profiles                                                                                                        |
| `corepack pnpm test:docker`                              | Passed; built image, started Compose, created a transaction, restarted and recreated the container, verified its persisted amount, and removed the test transaction |
| `corepack pnpm audit --audit-level=low`                  | No known vulnerabilities found                                                                                                                                      |
| `curl --fail --show-error http://127.0.0.1:8080/healthz` | HTTP 200, `{"status":"ok"}`                                                                                                                                         |
| `curl --fail --show-error http://127.0.0.1:8080/readyz`  | HTTP 200, `{"status":"ready"}`                                                                                                                                      |
| `docker-compose ps --format json`                        | Container running with `Health: healthy`                                                                                                                            |

## Coverage

The coverage run includes domain, application, persistence, HTTP adapters, browser features, and browser shared components. Generated files and executable bootstrap modules are excluded. Thresholds remain enforced in `vitest.config.ts`.

| Scope                        | Statements | Branches |
| ---------------------------- | ---------- | -------- |
| Overall                      | 92.42%     | 84.48%   |
| Financial domain and reports | 100%       | 95.21%   |

## Browser acceptance

Profiles: desktop, 320px mobile, 360px mobile, 390px mobile, 768px tablet, and 844px landscape. Tests create, edit, and delete transactions through the UI; inspect all screens for horizontal page overflow; switch English, Spanish, and Brazilian Portuguese; verify twelve monthly detail rows; and record EUR, zero-decimal JPY, and three-decimal KWD amounts through the quick-entry form. Currency assertions read the persisted generated REST messages, rather than only inspecting formatted screen text.

Component tests use React Testing Library and MSW, including real Fastify injection behind the HTTP boundary for configuration CRUD, settings, reports, transaction editing, and CSV preview/confirmation. Integration tests also verify invalid input, idempotency conflicts, preview validation, duplicate imports, rollback after category archival, SQLite writer contention, historical exchange-rate stability, and database reopen behavior.

## Operational and review notes

The deployed service is bound to `127.0.0.1:8080`; the host database is `./data/finance.db`. The container runs without root privileges, has a read-only application filesystem, and passed its health check after recreation. The smoke test leaves no test transaction, but its financial mutation audit events are intentionally retained.

The build emits a nonfatal size advisory for the Ant Design vendor chunk. It does not affect build completion. Browser testing here used Chromium device emulation, not physical devices or WebKit. JSDOM emits notices for unsupported pseudo-element layout queries; real browser layout checks are covered separately by Playwright.

Application source and seeds were reviewed for provider-specific import code, embedded personal entities or financial assumptions, authentication/session tables, and savings-account workflows. Normal startup seeds contain only generic category slugs and application defaults. The separately requested, opt-in demo seed adds synthetic 2025–2026 records through application ports. Test amounts and descriptions are explicitly synthetic. Technology and framework names in documentation and dependency metadata are not application-specific financial data.

## Ant Design and demo-data update

Removed the custom theme and all component CSS overrides. Layout, typography, forms, date/month pickers, color selection, uploads, report lists, summaries, and icons use Ant Design. Recharts remains the chart renderer, using Ant Design theme tokens. Full validation passed: 104 tests, coverage thresholds, TypeScript, ESLint, formatting, production build, and 18 browser checks. The rebuilt local container is healthy.

The demo seed was tested for idempotency, report reconciliation, preserved settings, six currencies, and zero-income behavior. The running API reports 727 transactions. After detecting a SQLite startup failure caused by host/container concurrent access, the pre-seed backup was restored with the container stopped and the dataset was recreated. SQLite integrity verification returned `ok` before restarting. README now documents exclusive host access when seeding a Docker bind mount.
