import { buildApp } from "../apps/api/src/app.js";

// Test-only server: the production entry point never imports this verifier.
const { app } = await buildApp({
  database: ":memory:",
  origin: "http://127.0.0.1:8083",
  clientId: "e2e-placeholder.apps.googleusercontent.com",
  verifyGoogle: (credential) => {
    if (credential !== "synthetic-e2e-credential")
      return Promise.reject(new Error("Invalid test credential"));
    return Promise.resolve({
      sub: "synthetic-e2e-user",
      aud: "e2e-placeholder.apps.googleusercontent.com",
      iss: "https://accounts.google.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: "E2E Tester",
      picture: "https://lh3.googleusercontent.com/e2e-avatar.svg",
    });
  },
});
await app.listen({ port: 8083, host: "127.0.0.1" });
