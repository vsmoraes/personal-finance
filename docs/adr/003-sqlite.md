# ADR 003 — SQLite, WAL and explicit transactions

Status: accepted.

A local single-profile application benefits from a single durable database without an additional service. Use Drizzle with parameterized SQLite access, foreign keys, WAL, indexed dates/categories, version-checked mutations, and an immediate transaction for each use case. Migrations are checksummed and transactional. A five-second busy timeout bounds contention; lock errors return a retryable response. The online backup API produces consistent backups. SQLite data must be on a local writable filesystem, not a network share.
