# ADR 002 — Exact monetary values in their original currencies

Status: accepted; conversion decision superseded by the user's 2026-09-20 scope change.

Represent money as positive bigint minor units and an ISO 4217 currency code. Transaction type carries direction. Persist integer decimal strings so SQLite/JavaScript number coercion cannot lose int64 precision. Preserve the original amount and currency; do not request rates or calculate converted amounts.

Reports select exactly one currency. Budgets, category defaults, recurring commitments, and scenario overrides contribute only when their currency matches that selection. A configured default currency is an entry/report preference and can change without rewriting history. Amount sorting groups currencies first, then compares minor units within each group. Charts may project amounts to numeric coordinates, but financial calculations and formatted money remain exact.

Migration 0002 retains transaction IDs, versions, deduplication keys, original amounts, and user preferences. It removes obsolete conversion data from active payloads and archives old rate records in an unused table. The v1 Protobuf conversion fields remain deprecated and ignored for wire compatibility; generated descriptors are not hand-edited. Exchange-rate routes, repositories, provider interfaces, and conversion arithmetic are removed.
