# ADR 005 — Authentication is deferred

Status: accepted.

Authentication is explicitly out of scope. The service is suitable for local use or a trusted private network. Bind to loopback by default. External access must pass through an authenticated proxy, VPN, or equivalent access control. Same-origin checks, CSP, request limits, and financial log redaction are defense in depth; they are not authentication and do not make a public unauthenticated deployment acceptable.
