# Build a Production-Ready Personal Finance Web Application

Build a complete, production-ready personal finance web application.

Implement the application fully. Do not deliver only a plan, mockup, scaffold, or proof of concept. Avoid placeholder implementations, unfinished TODOs, fake persistence, and mocked production functionality.

When a minor implementation decision is unspecified, choose the simplest secure industry-standard option, document it, and continue.

## 1. Product goals

The application must allow a person to:

- Quickly record income and expenses.
- Maintain a complete, editable transaction history.
- Organize transactions into customizable categories.
- Configure monthly budgets.
- Compare actual spending against budgets.
- Review finances by month and full year.
- Calculate monthly and annual net savings.
- Forecast future income, expenses, and net savings.
- Import transaction data from CSV files.
- Automatically categorize transactions with configurable rules.
- Use multiple currencies.
- Use the application in multiple languages.
- Use the complete application comfortably from a mobile browser.

## 2. Scope

This version is a single-profile application.

Do not implement:

- User registration.
- User accounts.
- Login or logout.
- Authentication.
- Sessions.
- Roles or permissions.
- Multi-tenancy.
- Administrative user management.
- User invitations.
- Password management.
- Per-user data isolation.

Design the architecture so authentication and multi-user support can be added later without rewriting the entire domain, but do not implement them now.

Do not include `user_id` columns or pretend that multi-user functionality already exists.

## 3. Savings-account functionality is out of scope

Do not implement savings accounts or savings-account-specific workflows.

The following are out of scope:

- Savings accounts as a special account type.
- Deposits into savings.
- Withdrawals from savings.
- Savings-account balances.
- Savings-account reconciliation.
- Savings contribution reports.
- Expenses paid directly from savings.
- Savings-specific categories.
- Savings transfers.
- Savings-account forecasting.

The application must still calculate `net savings` as a reporting metric:

```text
net savings = income - expenses
```

This is a calculated result, not a savings-account balance.

Forecast savings means forecast income minus forecast expenses.

## 4. Mandatory technology stack

### General

- Use TypeScript throughout the repository.
- Enable strict TypeScript rules everywhere.
- Use a monorepo managed with `pnpm` workspaces.
- Commit the lockfile.
- Pin runtime and package-manager versions.

Suggested structure:

```text
apps/
  api/
  web/
packages/
  contracts/
  domain/
  database/
  config/
  eslint-config/
proto/
  finance/v1/
```

### Frontend

Use:

- React.
- Vite.
- Ant Design.
- Ant Design Charts or another charting library that integrates cleanly with Ant Design.
- React Router.
- TanStack Query.
- React Hook Form.
- `i18next` and `react-i18next`.
- Generated Protobuf types instead of manually duplicated API interfaces.

### Backend

Use:

- Node.js on the current active LTS release.
- TypeScript.
- Fastify.
- Drizzle ORM.
- SQLite.
- Versioned REST endpoints under `/api/v1`.

In production, the backend should serve the compiled React application so the complete product runs under one origin in one container.

## 5. Protobuf contracts with a REST API

REST is the external transport, but Protobuf must be the source of truth for API contracts.

Use:

- Buf.
- `buf lint`.
- `buf breaking`.
- `@bufbuild/protobuf`.
- `protoc-gen-es` or an equivalent maintained TypeScript generator.
- Protobuf validation annotations and Protovalidate where supported.
- `google.type.Date` or an equivalent date-only message.

Requirements:

- Define request, response, enum, pagination, error, money, transaction, category, budget, report, forecast, settings, categorization-rule, and import contracts in `.proto` files.
- Generate TypeScript types for the backend and frontend.
- Do not maintain duplicate handwritten REST DTO interfaces.
- Persistence entities may differ from transport messages, but the mappings must be explicit and tested.
- Generate OpenAPI documentation from the contracts where practical.
- Prevent OpenAPI and Protobuf definitions from silently diverging.
- Use standard Protobuf JSON mapping.
- Handle 64-bit monetary values safely.
- Generated files must be deterministic.
- Generated files must never be edited manually.
- CI must fail when generated files are stale.

## 6. Monetary and currency model

Support multiple currencies from the first release.

Requirements:

- Use ISO 4217 currency codes.
- Store money as integer minor units plus currency code.
- Never store or calculate money using binary floating-point values.
- Correctly support currencies with zero, two, or three decimal minor units.
- Configure a default entry/report currency, initially EUR; changing it never rewrites history.
- Format values using `Intl.NumberFormat`.
- Preserve every entry's original amount and currency.
- Do not convert amounts, request exchange rates, or maintain an exchange-rate feature.
- Never add values from different currencies together.
- Reports, charts, budgets, commitments, and forecast scenarios operate within a selected currency.

Define a reusable Protobuf message similar to:

```proto
message Money {
  int64 minor_units = 1;
  string currency_code = 2;
}
```

Use a safe bigint or string representation in REST JSON.

## 7. Internationalization

Support:

- English: `en`
- Spanish: `es`
- Portuguese, Brazil: `pt-BR`

Requirements:

- No user-facing text may be hardcoded in React components.
- Translate navigation, forms, buttons, validation, errors, empty states, chart labels, categories, dates, and accessibility labels.
- Detect browser language initially.
- Allow manual language selection.
- Persist the selected language in application settings.
- Apply locale-aware date, number, and currency formatting.
- API errors must expose stable error codes that the frontend translates.
- Category identifiers must use stable, language-independent slugs.
- Built-in category display names must come from translation resources.
- Allow custom category names.
- Custom category names do not need automatic machine translation.

Use consistent financial terminology in every language.

## 8. Application settings

Provide application-wide settings for:

- Language.
- Default entry/report currency.
- Timezone.
- First day of the week.
- Default date format.
- Default monthly-report year.
- Theme preference.
- Import defaults.

Persist settings in SQLite.

## 9. Transaction model

Support two transaction types:

- Income.
- Expense.

Transaction fields:

- ID.
- Transaction date.
- Type.
- Category.
- Positive monetary amount.
- Original amount and currency.
- Merchant, source, or counterparty.
- Note.
- Import source.
- External import ID.
- Categorization source: manual, import, or rule.
- Categorization rule ID when applicable.
- Budget-inclusion flag.
- Created timestamp.
- Updated timestamp.
- Optimistic concurrency version.

Requirements:

- Store amounts as positive values.
- Use transaction type to distinguish income from expenses.
- Do not use negative values to encode direction.
- Derive reporting month and year from the transaction date.
- Allow transaction editing.
- Recalculate affected reports immediately after changes.
- Use optimistic concurrency to prevent silent overwrites.

## 10. Categories

Seed a generic set of common categories.

### Income categories

- Salary.
- Freelance or contract work.
- Investment income.
- Refunds.
- Other income.

### Expense categories

- Housing.
- Utilities.
- Phone and internet.
- Groceries.
- Transportation.
- Insurance.
- Healthcare.
- Debt payments.
- Dining.
- Shopping.
- Entertainment.
- Travel.
- Education.
- Gifts and donations.
- Pets.
- Taxes.
- Other expenses.

Allow categories to be:

- Created.
- Edited.
- Archived.
- Assigned a color.
- Assigned an icon.
- Marked as income or expense.
- Marked as budgetable or non-budgetable.
- Given a default monthly budget.
- Reordered for display.

A category with no budget is different from a category with a zero budget:

- `No budget` means the category does not participate in budget variance.
- `Zero budget` means no spending is planned, so any spending creates an unfavorable variance.

Archived categories must remain visible on historical transactions but unavailable for new transactions unless restored.

## 11. Configurable categorization rules

Implement a general categorization-rule engine.

Do not seed rules containing real merchant names, people, organizations, personal amounts, or other application-specific information.

Rules must:

- Have an explicit priority.
- Be enabled or disabled.
- Support preview mode.
- Match merchant, source, counterparty, note, exact amount, amount range, transaction type, currency, or combinations.
- Assign a category.
- Optionally control budget inclusion.
- Record which rule matched.
- Avoid overwriting manually assigned categories unless explicitly requested.
- Stop after the first matching rule unless the rule configuration says otherwise.

Allow users to:

- Create rules.
- Edit rules.
- Reorder rules.
- Disable rules.
- Delete rules.
- Preview results against existing transactions.
- Reapply rules to selected transactions.
- See why a rule matched.

Deduplicate imported transactions using a stable combination of:

- Import source.
- External ID when available.
- Date.
- Amount.
- Currency.
- Normalized description.

## 12. Budgeting

Provide a budget configuration screen.

Support:

- Default monthly budget by category.
- Month-specific overrides.
- Effective date ranges.
- Recurring commitments.
- Non-budgetable categories.
- Budgets with their own currencies.
- Copying a month’s budget to future months.
- Copying the previous year’s budget.
- Annual budget totals derived from monthly budgets.

Do not hardcode personal amounts or category limits.

All budget amounts must be configurable.

A recurring commitment should be able to define:

- Category.
- Description.
- Amount.
- Currency.
- Start month.
- Optional end month.
- Recurrence interval.
- Whether it contributes to the budget automatically.

## 13. Dashboard

The main dashboard must show:

- Selected reporting year.
- Total income.
- Total expenses.
- Net savings.
- Savings rate.
- Budget versus actual status.
- Shared transaction entry drawer opened from the global top-bar action.
- Monthly charts.
- Recent transactions.

Net savings:

```text
net savings = total income - total expenses
```

Savings rate:

```text
savings rate = net savings / total income
```

Handle zero income without division errors.

### Shared entry drawer

Provide one reusable Ant Design entry drawer for the dashboard, transaction
history, and global creation menu. The same pattern applies to categories,
budgets, recurring commitments, categorization rules, and what-if plans.

Fields:

- Date.
- Transaction type.
- Category.
- Currency.
- Amount.
- Merchant, source, or counterparty.
- Note.

Requirements:

- Open it from the sticky top bar's right-aligned create button and dropdown.
- Do not duplicate create forms or action buttons on individual pages.
- Use Ant Design Drawer, Form, controls, validation, and feedback components.
- Validate all values.
- Show clear success and error feedback.
- Optimize the mobile flow for minimal taps.
- Keep the form usable while the on-screen keyboard is open.
- Never require horizontal scrolling.
- Disable duplicate submissions while a request is in progress.
- Support keyboard submission on desktop.
- Refresh dashboard data after a successful transaction.

## 14. Monthly breakdown

Display January through December for the selected year.

Columns:

- Month.
- Income.
- Expenses.
- Net savings.
- Budget.
- Budget variance.

Monthly calculations:

```text
net savings = income - expenses
budget variance = budget - expenses
```

Include a final `TOTAL FOR YEAR` row showing:

- Annual income.
- Annual expenses.
- Annual net savings.
- Annual budget.
- Annual budget variance.

The annual row must reconcile exactly with the 12 monthly rows.

Months without transactions must still appear with zero values.

## 15. Category breakdown

Allow selection of:

- Entire year.
- January.
- February.
- March.
- April.
- May.
- June.
- July.
- August.
- September.
- October.
- November.
- December.

For each expense category, show:

- Budget.
- Actual spending.
- Variance.

Below the categories, show separate summary rows:

- Total expenses for the selected period.
- Total income for the selected period.
- Net savings for the selected period.

Do not represent income or net savings as category columns.

When the selected period changes, the table and related charts must update immediately.

## 16. Charts

Create at least:

1. Monthly income versus expenses as a column chart.
2. Monthly net savings versus budget variance as a line chart.
3. Category spending breakdown for the selected month or year.

Critical requirements:

- Monthly chart series must contain exactly 12 data points.
- Total rows must never be included in chart series.
- Category charts must exclude synthetic summary rows.
- `TOTAL FOR YEAR`, `TOTAL FOR PERIOD`, `INCOME FOR PERIOD`, and `NET SAVINGS FOR PERIOD` must never be chart categories.
- API report responses must return detail rows and totals as separate fields.
- Charts must resize cleanly on mobile.
- Use accessible colors.
- Provide tooltips.
- Do not rely exclusively on color.
- Do not display misleading zero values for missing data.
- Chart labels must use the selected language and currency format.

## 17. Forecasting

Provide a configurable remaining-year forecast.

The forecast must:

- Start with recorded actual transactions.
- Apply recurring commitments.
- Apply monthly category budgets to future months.
- Calculate forecast income.
- Calculate forecast expenses.
- Calculate forecast monthly net savings.
- Calculate forecast year-end net savings.
- Allow scenario overrides without modifying actual budgets.

Allow users to create scenarios with overrides such as:

- Different expected income.
- Category spending reductions.
- Category spending increases.
- One-time future expenses.
- Recurring-expense changes.

Clearly distinguish:

- Actual.
- Budget.
- Forecast.

Do not ship scenarios containing personal values or assumptions.

## 18. Transaction history

Create a responsive transaction screen with:

- Pagination.
- Search.
- Date filters.
- Type filters.
- Category filters.
- Currency filters.
- Merchant or counterparty filters.
- Amount filters.
- Sorting.
- Editing.
- Deleting with confirmation.
- Bulk recategorization.
- Rule reapplication.
- CSV export.
- Original amount and currency.
- Categorization-rule indicators.

On mobile:

- Use cards or responsive lists.
- Do not compress a desktop table until it becomes unreadable.
- Keep primary actions reachable with one hand.
- Use drawers or full-screen mobile dialogs when appropriate.

## 19. Import and export

Support:

- Generic CSV imports.
- Configurable column mapping.
- CSV exports.
- JSON exports.

Do not include provider-specific or spreadsheet-specific import logic in the core implementation.

Design import adapters so provider-specific formats can be added later.

Import workflow:

1. Upload file.
2. Detect encoding and delimiter.
3. Map columns.
4. Select date and number formats.
5. Select default currency.
6. Normalize data.
7. Detect duplicates.
8. Preview categorization rules.
9. Preview validation errors.
10. Confirm import.
11. Import atomically.
12. Show an import summary.

Requirements:

- Invalid rows must not be silently discarded.
- Allow downloading an error report.
- An import must either complete consistently or roll back.
- Persist import metadata for audit and troubleshooting.
- Make repeated import confirmation idempotent.

## 20. REST API

Provide resource-oriented endpoints such as:

```text
GET    /api/v1/categories
POST   /api/v1/categories
GET    /api/v1/categories/:id
PATCH  /api/v1/categories/:id
DELETE /api/v1/categories/:id

GET    /api/v1/transactions
POST   /api/v1/transactions
GET    /api/v1/transactions/:id
PATCH  /api/v1/transactions/:id
DELETE /api/v1/transactions/:id

GET    /api/v1/budgets
PUT    /api/v1/budgets/:year/:month

GET    /api/v1/recurring-commitments
POST   /api/v1/recurring-commitments
PATCH  /api/v1/recurring-commitments/:id
DELETE /api/v1/recurring-commitments/:id

GET    /api/v1/categorization-rules
POST   /api/v1/categorization-rules
PATCH  /api/v1/categorization-rules/:id
DELETE /api/v1/categorization-rules/:id
POST   /api/v1/categorization-rules/preview

GET    /api/v1/reports/dashboard
GET    /api/v1/reports/monthly
GET    /api/v1/reports/categories
GET    /api/v1/reports/forecast

POST   /api/v1/imports
GET    /api/v1/imports/:id
POST   /api/v1/imports/:id/confirm


GET    /api/v1/settings
PATCH  /api/v1/settings

GET    /healthz
GET    /readyz
```

API requirements:

- Stable pagination.
- Explicit filtering and sorting.
- Idempotency keys for transaction creation and import confirmation.
- RFC 9457 Problem Details or an equivalent structured error format.
- Stable error codes.
- Request IDs.
- Optimistic concurrency.
- Correct HTTP status codes.
- Request-size limits.
- Strict input validation.
- Transactional writes.
- No leaked stack traces.
- No leaked filesystem or database paths.
- Consistent date and currency serialization.

## 21. SQLite persistence

Use SQLite through Drizzle ORM.

Requirements:

- Checked-in migrations.
- Foreign keys enabled.
- WAL mode.
- Appropriate indexes.
- Unique import and deduplication constraints.
- Atomic writes.
- UTC technical timestamps.
- Date-only financial dates.
- Safe startup migrations.
- Graceful handling of database locks.
- Backup and restore documentation.

Suggested tables:

- `categories`
- `transactions`
- `budgets`
- `recurring_commitments`
- `categorization_rules`
- `imports`
- `import_rows`
- `application_settings`
- `audit_events`

Do not create user, credential, password, session, role, or permission tables in this phase.

Record material financial mutations in the audit log.

## 22. Responsive and accessible UI

The UI must be mobile-first.

Test at:

- 320px.
- 360px.
- 390px.
- 768px.
- Desktop widths.

Requirements:

- No horizontal page scrolling.
- Touch targets of at least 44px where practical.
- Mobile-friendly navigation using an Ant Design Drawer or bottom navigation.
- Tables transform into cards or lists on small screens.
- Charts resize without clipping.
- Forms remain usable with mobile keyboards.
- Dialogs remain inside the viewport.
- Use Ant Design Grid and responsive breakpoints deliberately.
- Meet WCAG 2.1 AA where practical.
- Provide correct labels, focus management, keyboard navigation, contrast, and screen-reader announcements.
- Respect reduced-motion preferences.
- Design loading, empty, error, and network-failure states.
- Ensure important actions are not available only through hover.
- Test desktop and a representative mobile layout.

## 23. Production-readiness boundary

This version intentionally has no authentication.

Therefore:

- Treat it as a single-profile application intended for local use or a trusted private network.
- Clearly document that it must not be exposed directly to the public internet without an authenticated reverse proxy, VPN, or equivalent external access control.
- Do not create fake or incomplete authentication to satisfy a checklist.
- Keep the API architecture compatible with adding authentication later.
- Do not claim that the application is safe for unprotected public internet exposure.

Production readiness within this defined scope still requires:

- Reliable persistence.
- Validated input.
- Safe migrations.
- Security headers.
- Request limits.
- Structured errors.
- Dependency scanning.
- Health checks.
- Backups.
- Graceful shutdown.
- Logging.
- Auditability.
- Deterministic builds.
- Complete tests.

## 24. Security

Include:

- Helmet and secure HTTP headers.
- Restrictive Content Security Policy.
- Request rate limiting.
- Parameterized database queries.
- Input validation at every boundary.
- Output encoding.
- Environment-based configuration.
- No secrets in the repository or image.
- Dependency vulnerability scanning.
- Financial-data redaction in logs.
- Request correlation IDs.
- Structured Pino logging.
- Graceful shutdown.
- Health and readiness endpoints.
- Audit logging for create, update, delete, import, and settings changes.

Configure CORS for same-origin production deployment.

Do not add unused authentication dependencies.

## 25. Docker deployment

Provide:

- Multi-stage `Dockerfile`.
- Production `docker-compose.yml`.
- `.dockerignore`.
- `.env.example`.
- Container health check.
- Non-root runtime user.
- Read-only application filesystem where practical.
- Writable `/data` directory.
- Restart policy.
- Graceful shutdown.

The SQLite database must live on the host:

```yaml
services:
  finance:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
    environment:
      DATABASE_URL: file:/data/finance.db
```

Requirements:

- Replacing the container must not delete data.
- A missing database must initialize safely.
- Migrations must run safely at startup or through a documented command.
- Document host-directory ownership and permissions.
- Provide backup and restore commands.
- Include only production dependencies and compiled assets in the final image.
- Use deterministic builds.
- Persist imports and temporary upload data safely or remove temporary files after processing.
- Add a useful health check to Docker Compose.

## 26. Strict code quality

Enable:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noPropertyAccessFromIndexSignature": true,
  "useUnknownInCatchVariables": true
}
```

Use:

- ESLint flat configuration.
- Type-aware `typescript-eslint`.
- React Hooks rules.
- JSX accessibility rules.
- Import-boundary rules.
- Deterministic formatting.
- Sorted imports.
- No implicit `any`.
- No explicit `any` without a documented local exception.
- No floating promises.
- No unsafe assignments.
- No unchecked type assertions.
- No production `console.log`.
- No circular dependencies.
- No frontend imports from backend-only packages.
- No manual edits to generated Protobuf files.

Provide scripts for:

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm proto:lint
pnpm proto:generate
pnpm proto:breaking
```

All commands must pass before completion.

## 27. Tests

Use:

- Vitest.
- React Testing Library.
- MSW.
- Fastify injection.
- Temporary SQLite databases.
- Playwright.
- Mobile Playwright profiles.
- Contract-generation tests.
- Migration tests.
- Docker smoke tests.

Test at minimum:

- Money arithmetic.
- Currency isolation without conversion.
- Currency minor-unit differences.
- Monthly aggregation.
- Annual aggregation.
- Net-savings calculations.
- Savings-rate calculations.
- Budget variance.
- No-budget versus zero-budget behavior.
- Category creation and archiving.
- Categorization-rule priority.
- Categorization preview.
- Manual category protection.
- Import deduplication.
- Import rollback.
- Import idempotency.
- Validation errors.
- Optimistic concurrency.
- Language switching.
- Locale-aware currency formatting.
- Responsive layouts.
- Mobile quick entry.
- Docker database persistence.
- Charts containing exactly 12 months.
- Charts excluding total rows.
- Zero-income savings-rate handling.
- Months without transactions.
- Forecast calculations.
- Preservation of original amounts and currencies.

Coverage thresholds:

- Unit and integration suites must remain fast and deterministic; browser journeys
  belong in Playwright E2E checks rather than the unit job. Coverage reporting is
  available for local investigation but is not a PR blocking requirement.
- Keep coverage reporting available for local investigation; it is not a PR
  blocking requirement.
- Prefer behavioral tests over superficial snapshots.

## 28. Continuous integration

CI must run:

- Frozen-lockfile installation.
- Protobuf lint.
- Protobuf generation consistency.
- Protobuf breaking checks where possible.
- Formatting.
- ESLint.
- Type checking.
- Unit tests.
- Integration tests.
- Production build.
- End-to-end tests.
- Docker image build.
- Container health test.
- Dependency and security audit.

CI must fail when generated Protobuf code is stale.

## 29. Documentation

Provide:

- Complete `README.md`.
- Local-development instructions.
- Docker deployment instructions.
- Environment-variable reference.
- Database migration instructions.
- Backup and restore instructions.
- Import instructions.
- Protobuf-generation instructions.
- Test commands.
- Architecture overview.
- API documentation.
- Security boundary documentation.
- Instructions for placing the application behind an authenticated reverse proxy.
- Troubleshooting guide.

Include ADRs covering:

- REST using Protobuf contracts.
- Monetary representation.
- SQLite and WAL mode.
- Single-profile architecture.
- Authentication being deferred.
- Single-container production deployment.

## 30. Acceptance criteria

The implementation is complete only when:

1. `docker compose up` starts the application.
2. The application is available on port 8080.
3. SQLite is stored under host `./data`.
4. Restarting or rebuilding the container preserves data.
5. Income and expense transactions can be created, edited, and deleted.
6. The shared top-bar entry action opens the drawer and persists transactions.
7. Reports update immediately after transaction changes.
8. Monthly reports show income, expenses, net savings, budget, and variance.
9. Annual totals reconcile exactly with the 12 monthly rows.
10. Category reports work for a selected month and full year.
11. Charts contain exactly 12 monthly data points.
12. Total and summary rows never appear in charts.
13. Categories and categorization rules are fully configurable.
14. No personal names, merchants, organizations, amounts, or rules are embedded in seeds or source code.
15. English, Spanish, and Brazilian Portuguese are complete.
16. Reports isolate the selected currency and never convert or sum different currencies.
17. The application works at 320px without horizontal scrolling.
18. Mobile forms, navigation, dialogs, and charts remain usable.
19. REST types are generated from Protobuf contracts.
20. There are no duplicate handwritten frontend and backend DTOs.
21. All linting, type checks, tests, Protobuf checks, and builds pass.
22. The container passes its health check.
23. No user, authentication, session, role, or permission handling is implemented.
24. No savings-account-specific handling is implemented.
25. Public-internet exposure limitations are clearly documented.
26. No material feature remains mocked or unfinished.

## 31. Final delivery

Deliver:

- Complete repository.
- Protobuf contracts.
- Generated TypeScript contracts.
- Database schema and migrations.
- Generic seed categories.
- Responsive React UI.
- REST API.
- Tests.
- CI configuration.
- Dockerfile.
- Docker Compose configuration.
- Documentation.

Before completion:

1. Run linting and type checks.
2. Run all tests.
3. Build the production application.
4. Build the Docker image.
5. Start the application with Docker Compose.
6. Verify health endpoints.
7. Create transactions through the UI.
8. Restart the container.
9. Verify persistence.
10. Test with mobile Playwright profiles.
11. Verify all three languages.
12. Verify multiple currencies.
13. Verify chart source data excludes total rows.
14. Search the repository for personal names, merchant names, organization names, personal amounts, and spreadsheet-specific references.
15. Confirm none are present.
16. Report the exact verification commands and results.

## 32. Refined decisions and current implementation

This section records decisions made during implementation and supersedes any
earlier wording that conflicts with it. It is part of the requirements and
must remain current when the product changes.

### Product scope and terminology

- The product is a single-profile finance application. It deliberately has no
  authentication, account management, sessions, roles, permissions, or
  multi-tenancy. It must run only locally or behind an authenticated proxy or
  VPN on a trusted private network.
- “Scenarios” is user-facing terminology for **What-if plans**. A plan changes
  forecast assumptions only; it never mutates transactions or budgets.
- Savings is a calculated reporting value (`income - expenses`), never a
  savings-account balance or transfer workflow.
- Demo data is synthetic and is available only through the explicit development
  seed command. Production startup never seeds transactions, merchants,
  personal values, or forecast plans.

### Currency and data integrity

- Every transaction, budget, recurring commitment, import row, and what-if
  change keeps its own ISO currency and positive minor-unit amount.
- Exchange-rate lookup, conversion, base-currency totals, and cross-currency
  arithmetic are removed from active behavior. Values in different currencies
  are never added together. Reports and charts operate on a selected currency.
- Deprecated conversion fields and legacy database records are retained only
  for wire and migration compatibility, are ignored by application behavior,
  and are not exposed as editable features.
- The default currency is EUR, but changing it never rewrites historical data.

### UI architecture and interaction rules

- The frontend is React and TypeScript, with each feature/component in its own
  TypeScript file. Ant Design supplies layouts, navigation, forms, tables,
  drawers, controls, icons, feedback, and responsive behavior. Recharts is used
  only for financial charts and receives Ant Design theme tokens.
- The top bar is sticky. Its left side contains the responsive sidebar control
  and breadcrumb. Its right side contains the global create action followed by
  the account dropdown (settings now, profile/logout reserved for later).
- The sidebar follows Ant Design `Layout.Sider` and `Menu` patterns, supports
  collapse without broken labels, preserves the active group's open state on
  refresh, and uses a responsive Drawer on compact screens.
- The global create action opens the shared entry drawer. Overview and all
  resource pages do not render duplicate create buttons or dedicated forms.
- Resource lists use Ant Design `Table`; search, filters, sorting, pagination,
  selection, and actions follow Ant Design column-attached patterns.
- Settings are organized into tabs. Theme is its own tab with light, dark, and
  custom modes. Custom mode exposes background, surface/box, application accent
  and secondary accent, sidebar accent and secondary accent, plus a light/dark
  color-behavior setting. These tokens control the complete shell, sidebar
  selection, collapse trigger, buttons, and overview icon backgrounds.
- The save action in settings must show a success toast. Invalid custom colors,
  theme mode, and settings values are rejected with translated validation
  feedback.
- Supported languages are English, Spanish, and Brazilian Portuguese. All
  visible labels, errors, empty states, accessibility names, and category names
  are translated; no feature component owns user-facing hardcoded copy.

### Architecture and persistence

- Hexagonal boundaries are enforced: domain rules are framework-independent,
  application services own use cases, adapters own HTTP and SQLite, and the
  API composition root is the only place that wires infrastructure.
- Protobuf is the contract source of truth. Generated TypeScript and OpenAPI
  artifacts are checked for determinism, freshness, and breaking changes.
- SQLite runs in WAL mode with checksum-protected migrations, immediate
  migration transactions, optimistic versions, idempotency keys, audit events,
  and explicit repository mappings. The database is mounted outside the
  container at `/data/finance.db`.
- Production containers use a read-only filesystem, non-root UID/GID 1000,
  dropped capabilities, a bounded `/tmp`, health/readiness checks, graceful
  shutdown, and restart policy. The host/NAS data directory must be writable by
  the configured container UID/GID.
- Docker images are multi-stage and multi-architecture (`linux/amd64` and
  `linux/arm64`). Synology deployments use
  `docker-compose.synology.yml`, a pinned image tag, and an externally mounted
  local-volume data directory. SQLite files must not live on network shares.

### Operations, quality, and delivery

- The Makefile is the canonical task entry point for installation, formatting,
  verification, tests, integration, E2E, Docker builds, Synology builds,
  Compose lifecycle, and guarded development-only demo seeding.
- CI runs focused jobs for contracts/generated files, formatting/lint/types,
  unit/component tests, production build, and desktop smoke E2E on pull
  requests. Jobs run in parallel where possible and use explicit dependencies
  for generated contracts and build artifacts. After changes land on `main`,
  it adds complete unit tests, integration tests, the complete Playwright
  desktop/mobile E2E checks, dependency audit, and Docker persistence smoke
  tests.
- Releases are created manually in GitHub. Publishing a release with a semantic
  version tag (`vX.Y.Z`) publishes `linux/amd64` and `linux/arm64` images to
  GHCR with a `latest` tag; pushes to `main` never open release pull requests.
  Production deployments should use a pinned version tag.
- README and ADRs document local development, API behavior, architecture,
  database ownership, migrations, online backups/restores, Synology deployment,
  security boundaries, troubleshooting, and the no-production-seed rule.
- Repository audits must exclude ignored build output, dependencies, coverage,
  test results, and local databases. Source, fixtures, demo scripts, and tests
  may contain only generic or clearly synthetic values; no personal names,
  addresses, emails, phone numbers, account identifiers, credentials, private
  keys, real merchants, or personal financial records may be committed.

### Current verification baseline

The implementation is considered ready when these commands pass from a clean
checkout: `corepack pnpm format:check`, `corepack pnpm lint`,
`corepack pnpm typecheck`, `corepack pnpm proto:lint`,
`corepack pnpm proto:check`, `corepack pnpm proto:breaking`,
`corepack pnpm api:check`, `corepack pnpm test`, `corepack pnpm
test:integration`, `corepack pnpm build`, `corepack pnpm test:e2e`, and the
Docker smoke test. Docker daemon availability is an environment prerequisite;
Compose configuration must still parse before deployment.
