import { createHash, randomBytes } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { OAuth2Client } from "google-auth-library";

import type {
  AuthDatabase,
  AuthUser,
} from "../../../packages/database/src/auth.js";
import { DomainError } from "../../../packages/domain/src/money.js";

const sessionCookie = "finance_session";
const csrfCookie = "finance_csrf";
const maxAge = 7 * 24 * 60 * 60;
const randomToken = () => randomBytes(32).toString("base64url");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function cookie(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return raw?.slice(name.length + 1);
}

export type GoogleVerifier = (token: string) => Promise<{
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  name?: string;
  picture?: string;
}>;

export function googleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client({ clientId });
  return async (token) => {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.aud || !payload.iss || !payload.exp)
      throw new Error("INVALID_ID_TOKEN");
    return {
      sub: payload.sub,
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp,
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.picture ? { picture: payload.picture } : {}),
    };
  };
}

export function registerAuth(
  app: FastifyInstance,
  options: {
    database: AuthDatabase;
    clientId: string;
    origins: string[];
    secure: boolean;
    verify: GoogleVerifier;
  },
): { userId(request: FastifyRequest): string } {
  const { database, clientId, origins, secure, verify } = options;
  const attributes = `Path=/; SameSite=Strict${secure ? "; Secure" : ""}`;
  const setCookie = (name: string, value: string, seconds: number) =>
    `${name}=${value}; ${attributes}; HttpOnly; Max-Age=${seconds}`;
  const users = new WeakMap<FastifyRequest, AuthUser>();
  const bootstrap = new Set([
    "/api/v1/auth/config",
    "/api/v1/auth/csrf",
    "/api/v1/auth/google",
  ]);

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (
      ["/login", "/healthz", "/readyz"].includes(path) ||
      path.startsWith("/assets/") ||
      path === "/favicon.ico"
    )
      return;
    if (path.startsWith("/api/") && bootstrap.has(path)) return;
    const token = cookie(request, sessionCookie);
    const user = token ? await database.sessionUser(token) : undefined;
    if (!user) {
      if (!path.startsWith("/api/") && ["GET", "HEAD"].includes(request.method))
        return reply.redirect("/login");
      throw new DomainError("UNAUTHENTICATED", 401);
    }
    users.set(request, user);
  });

  app.get("/api/v1/auth/config", async () => ({ clientId }));
  app.get("/api/v1/auth/csrf", async (_request, reply) => {
    const token = randomToken();
    reply.header("set-cookie", setCookie(csrfCookie, token, 600));
    return { csrfToken: token };
  });
  app.get("/api/v1/auth/session", async (request) => ({
    user: users.get(request),
  }));
  app.post("/api/v1/auth/google", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !origins.includes(origin))
      throw new DomainError("ORIGIN_REJECTED", 403);
    const csrf = cookie(request, csrfCookie);
    const header = request.headers["x-csrf-token"];
    if (!csrf || typeof header !== "string" || digest(csrf) !== digest(header))
      throw new DomainError("CSRF_REJECTED", 403);
    const body = request.body;
    if (
      !body ||
      typeof body !== "object" ||
      !("credential" in body) ||
      typeof body.credential !== "string" ||
      body.credential.length > 10000
    )
      throw new DomainError("INVALID_INPUT", 400);
    let payload: Awaited<ReturnType<GoogleVerifier>>;
    try {
      payload = await verify(body.credential);
    } catch {
      throw new DomainError("INVALID_ID_TOKEN", 401);
    }
    if (
      !payload.sub ||
      payload.aud !== clientId ||
      !["accounts.google.com", "https://accounts.google.com"].includes(
        payload.iss,
      ) ||
      payload.exp <= Date.now() / 1000
    )
      throw new DomainError("INVALID_ID_TOKEN", 401);
    const user = await database.findOrCreateUser({
      sub: payload.sub,
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.picture ? { picture: payload.picture } : {}),
    });
    const token = randomToken();
    await database.createSession(
      user.id,
      token,
      new Date(Date.now() + maxAge * 1000).toISOString(),
    );
    reply.header("set-cookie", [
      setCookie(sessionCookie, token, maxAge),
      setCookie(csrfCookie, "", 0),
    ]);
    return { user };
  });
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !origins.includes(origin))
      throw new DomainError("ORIGIN_REJECTED", 403);
    const token = cookie(request, sessionCookie);
    if (token) await database.deleteSession(token);
    reply.header("set-cookie", setCookie(sessionCookie, "", 0));
    return { signedOut: true };
  });
  return {
    userId(request) {
      const user = users.get(request);
      if (!user) throw new DomainError("UNAUTHENTICATED", 401);
      return user.id;
    },
  };
}
