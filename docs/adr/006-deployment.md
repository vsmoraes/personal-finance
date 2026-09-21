# ADR 006 — One production container

Status: accepted.

Fastify serves the compiled React application and API under one origin. A multi-stage build separates development tools from production modules and assets. The final container is non-root, with a read-only application filesystem and a host-mounted writable data directory. Startup migrations, readiness checks, bounded shutdown, and restart policy keep deployment operationally simple. Recreating containers preserves the host database. No separate frontend origin or cross-origin API configuration is required.
