# ADR 004 — Single profile and hexagonal architecture

Status: accepted.

The product has one application-wide profile. No user IDs, tenant abstractions, credentials, sessions, or permission tables are present. Domain calculations depend only on value contracts. Application use cases depend on repository, transaction, import, and runtime ports. Drizzle, Fastify, filesystem access, and clocks are wired at the composition root. Future identity or tenancy must be added through explicit adapters, scoped repositories, and migrations rather than speculative behavior in today's domain.
