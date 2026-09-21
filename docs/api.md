# REST API

All financial endpoints are under `/api/v1`. See [OpenAPI](openapi.json), generated from Protobuf descriptors and route registrations, for paths and message schemas. All requests and responses follow standard Protobuf JSON: camel-case fields, symbolic enum names, and decimal-string int64 values. Default-valued scalar fields may be omitted. Unknown body fields are rejected.

`GET /healthz` checks process health; `GET /readyz` verifies the database is readable. Responses carry `X-Request-Id`. Errors use `application/problem+json` with `type`, `title`, `status`, stable `code`, and `requestId`.

## Transactions

```http
POST /api/v1/transactions
Content-Type: application/json
Idempotency-Key: <unique-operation-key>

{
  "date": {"year": 2026, "month": 1, "day": 15},
  "type": "TRANSACTION_TYPE_EXPENSE",
  "categoryId": "groceries",
  "amount": {"minorUnits": "1234", "currencyCode": "EUR"},
  "includeInBudget": true
}
```

The example amount is synthetic. The server assigns ID, timestamps, version, base amount, and categorization metadata. A successful create returns 201. Use `PATCH /transactions/:id` with the complete editable message and current `version`; this API's PATCH semantics replace the editable state, rather than merge omitted fields. Server-owned identity and audit fields cannot be overridden. A stale version returns 409. Deleting requires `If-Match: <version>` and returns 204 without a body.

List filters: `page` (1-based), `pageSize` (maximum 100), `search`, `startDate`, `endDate`, `type`, `categoryId`, `currencyCode`, `counterparty`, `minMinorUnits`, `maxMinorUnits`, `sort`, and `descending`. Sort fields are `date`, `amount` (persisted base amount), `counterparty`, and `createdAt`; ID breaks ties. Original-amount filters should be paired with a currency filter for meaningful comparisons. Response pagination includes total count.

## Configuration

Categories, budgets, recurring commitments, rules, and scenarios support list, get, create, update, and delete. Category deletion archives the category. Restore via PATCH. Configuration updates also use current versions; deletes use If-Match. `PUT /budgets/:year/:month` writes a specific category/currency/month override. `POST /budgets/copy` copies effective configured amounts between selected months or years. Recurring commitments are independent and are not duplicated by copying.

Settings are a single application-wide message. The default currency is a preference only and can be changed without rewriting existing entries. Language supports `en`, `es`, `pt-BR`.

## Reports

`/reports/dashboard`, `/reports/monthly`, `/reports/categories`, and `/reports/forecast` accept `year` and `currencyCode` (defaults to the entry currency setting); category reports accept `month` (0 means entire year). Forecast accepts optional `scenarioId` and `asOfDate`. Detail `rows` and `totals` are separate fields. Monthly rows always have twelve entries. Report amounts are original minor-unit strings for the selected currency. Transactions, budgets, commitments, and scenario overrides in other currencies are excluded. Optional budgets/variances distinguish absent budgets from zero. `savingsRate` is an exact integer count of basis points, or an empty value for zero income.

## Imports and exports

`POST /imports` receives a filename, base64 CSV content, source, mapping, and parsing preferences; empty mappings return header detection. A mapped request persists a normalized preview with row errors, duplicate flags, and rule reasons. `POST /imports/:id/confirm` requires an idempotency header; the import ID itself is the durable idempotency scope. Any invalid row prevents all writes. `/imports/:id/errors` downloads row errors. `GET /export?format=csv` exports transactions; `format=json` exports all financial resources and settings.

## Limits and error codes

JSON bodies are limited to 3 MB; decoded CSV to 2 MB and 10,000 rows. API rate limits are 1,200 requests per minute per client address. Production does not enable cross-origin requests. Typical error codes: `INVALID_INPUT`, `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_CURRENCY`, `CATEGORY_TYPE_MISMATCH`, `CATEGORY_ARCHIVED`, `CONFLICT`, `IMPORT_INVALID`, `IDEMPOTENCY_CONFLICT`, `NOT_FOUND`, `DATABASE_BUSY`, and `INTERNAL_ERROR`. Database lock errors return 503 and may be retried; invalid requests return 400/422, absent resources 404, concurrency conflicts 409. Browser messages translate codes rather than displaying server exception text.

Exchange-rate endpoints have been removed. Conversion fields in the v1 Protobuf descriptors are deprecated and ignored; they are retained only to avoid reusing wire numbers. `Settings.defaultCurrency` is a preference, not a conversion target, and may be changed after recording transactions. CSV/JSON exports contain original money only. Amount sorting groups entries by ISO currency before comparing minor units.
