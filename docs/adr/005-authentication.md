# ADR 005 — Google sign-in and private data

Status: accepted.

Google Identity Services is the only login method. The Fastify backend verifies ID tokens, identifies accounts by `sub`, and issues opaque, revocable sessions. Authentication gates every finance API route, but signed-in users share all finance resources. A `created_by_user_id` field is attribution, not an authorization boundary. The migration creates a system user and attributes pre-authentication records to it. HTTPS is required at the public reverse proxy.
