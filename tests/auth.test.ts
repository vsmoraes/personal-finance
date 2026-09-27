import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../apps/api/src/app.js";
import { googleVerifier } from "../apps/api/src/auth.js";

const origin = "http://localhost:8080";
const clientId = "test-web-client.apps.googleusercontent.com";
let directory: string;
let context: Awaited<ReturnType<typeof buildApp>>;
const claim = (sub: string) => ({
  sub,
  aud: clientId,
  iss: "https://accounts.google.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  name: sub,
  picture: "https://lh3.googleusercontent.com/test-photo",
});
function firstCookie(header: string | string[] | undefined, name: string) {
  const entries = Array.isArray(header) ? header : [header ?? ""];
  return (
    entries.find((entry) => entry.startsWith(`${name}=`))?.split(";")[0] ?? ""
  );
}
async function signIn(credential: string) {
  const csrf = await context.app.inject("/api/v1/auth/csrf");
  const csrfBody = JSON.parse(csrf.body) as { csrfToken: string };
  return context.app.inject({
    method: "POST",
    url: "/api/v1/auth/google",
    headers: {
      origin,
      cookie: firstCookie(csrf.headers["set-cookie"], "finance_csrf"),
      "x-csrf-token": csrfBody.csrfToken,
    },
    payload: { credential },
  });
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "finance-auth-"));
  const webRoot = join(directory, "web");
  mkdirSync(webRoot);
  writeFileSync(
    join(webRoot, "index.html"),
    "<!doctype html><title>Login</title>",
  );
  context = await buildApp({
    database: join(directory, "data.db"),
    webRoot,
    origin,
    clientId,
    verifyGoogle: (token) => {
      if (token === "alice" || token === "bob")
        return Promise.resolve(claim(token));
      if (token === "expired")
        return Promise.resolve({ ...claim(token), exp: 1 });
      if (token === "wrong-audience")
        return Promise.resolve({ ...claim(token), aud: "other" });
      if (token === "wrong-issuer")
        return Promise.resolve({
          ...claim(token),
          iss: "https://example.invalid",
        });
      throw new Error("Invalid signature");
    },
  });
});
afterEach(async () => {
  await context.app.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("Google sign-in and shared finance access", () => {
  it("rejects malformed, expired and wrong-audience tokens and missing CSRF", async () => {
    for (const token of [
      "invalid",
      "expired",
      "wrong-audience",
      "wrong-issuer",
    ])
      expect((await signIn(token)).statusCode).toBe(401);
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/v1/auth/google",
          headers: { origin },
          payload: { credential: "alice" },
        })
      ).statusCode,
    ).toBe(403);
    await expect(googleVerifier(clientId)("not-a-jwt")).rejects.toThrow();
  });
  it("blocks unauthenticated reads and writes", async () => {
    const page = await context.app.inject("/");
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe("/login");
    expect((await context.app.inject("/transactions")).statusCode).toBe(302);
    const login = await context.app.inject("/login");
    expect(login.statusCode).toBe(200);
    expect(login.headers["cross-origin-opener-policy"]).toBe(
      "same-origin-allow-popups",
    );
    expect(login.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(login.headers["content-security-policy"]).toContain(
      "https://accounts.google.com/gsi/style",
    );
    expect((await context.app.inject("/api/v1/categories")).statusCode).toBe(
      401,
    );
    expect(
      (await context.app.inject("/api/v1/export?format=json")).statusCode,
    ).toBe(401);
    expect((await context.app.inject("/api/v1/auth/session")).statusCode).toBe(
      401,
    );
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/v1/scenarios",
          headers: { origin },
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
  });
  it("shares records, credits the system and human creators, and revokes sign-out", async () => {
    context.store.sqlite
      .prepare(
        "INSERT INTO scenarios (id, payload, version) VALUES ('legacy-scenario', '{}', 1)",
      )
      .run();
    const alice = await signIn("alice");
    expect(alice.statusCode, alice.body).toBe(200);
    const aliceCookie = firstCookie(
      alice.headers["set-cookie"],
      "finance_session",
    );
    const session = await context.app.inject({
      url: "/api/v1/auth/session",
      headers: { cookie: aliceCookie },
    });
    expect(
      (
        JSON.parse(session.body) as {
          user: { displayName: string; pictureUrl: string };
        }
      ).user,
    ).toMatchObject({
      displayName: "alice",
      pictureUrl: "https://lh3.googleusercontent.com/test-photo",
    });
    const aliceCategories = await context.app.inject({
      url: "/api/v1/categories",
      headers: { cookie: aliceCookie },
    });
    expect(
      (JSON.parse(aliceCategories.body) as { categories: unknown[] })
        .categories,
    ).toHaveLength(22);
    expect(
      (
        await context.app.inject({
          url: "/api/v1/scenarios/legacy-scenario",
          headers: { cookie: aliceCookie },
        })
      ).statusCode,
    ).toBe(200);
    const categoryId = "groceries";
    const created = await context.app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      headers: {
        origin,
        cookie: aliceCookie,
        "idempotency-key": "alice-key-0001",
      },
      payload: {
        date: { year: 2026, month: 1, day: 15 },
        type: "TRANSACTION_TYPE_EXPENSE",
        categoryId,
        amount: { minorUnits: "100", currencyCode: "EUR" },
        includeInBudget: true,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = (JSON.parse(created.body) as { id: string }).id;
    const bob = await signIn("bob");
    const bobCookie = firstCookie(bob.headers["set-cookie"], "finance_session");
    const aliceUser = (JSON.parse(alice.body) as { user: { id: string } }).user;
    expect(
      (
        await context.app.inject({
          url: `/api/v1/transactions/${id}`,
          headers: { cookie: bobCookie },
        })
      ).statusCode,
    ).toBe(200);
    const attribution = context.store.sqlite
      .prepare(
        "SELECT created_by_user_id AS creator, created_at AS createdAt FROM transactions WHERE id = ?",
      )
      .get(id) as { creator: string; createdAt: string };
    expect(attribution.creator).toBe(aliceUser.id);
    expect(attribution.createdAt).toMatch(/^2026-/);
    expect(
      (
        await context.app.inject({
          url: `/api/v1/transactions/${id}`,
          headers: { cookie: aliceCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      context.store.sqlite
        .prepare(
          "SELECT created_by_user_id AS creator FROM scenarios WHERE id = 'legacy-scenario'",
        )
        .get(),
    ).toEqual({ creator: "system" });
    expect(
      context.store.sqlite
        .prepare("SELECT id FROM users WHERE id = 'system'")
        .get(),
    ).toEqual({ id: "system" });
    expect(
      (
        await context.app.inject({
          method: "DELETE",
          url: `/api/v1/transactions/${id}`,
          headers: { origin, cookie: bobCookie, "if-match": "1" },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: { origin, cookie: aliceCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await context.app.inject({
          url: "/api/v1/categories",
          headers: { cookie: aliceCookie },
        })
      ).statusCode,
    ).toBe(401);
  });
});
