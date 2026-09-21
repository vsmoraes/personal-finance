# ADR 001 — REST with Protobuf contracts

Status: accepted.

Use versioned REST with standard Protobuf JSON. Protobuf definitions own message shapes, enum values, exact int64 transport, and validation annotations. Both browser and server consume generated TypeScript. Buf lint, breaking checks, deterministic generation checks, and descriptor-derived OpenAPI run in CI. This keeps ordinary HTTP interoperability without maintaining a second DTO model. Cross-resource and financial invariants remain application/domain rules because they require persisted context.
