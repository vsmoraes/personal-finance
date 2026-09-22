import { describe, expect, it } from "vitest";

import { databaseConfig } from "../packages/database/src/config.js";

describe("databaseConfig", () => {
  it("defaults to a local SQLite file", () => {
    expect(databaseConfig({})).toEqual({
      driver: "sqlite",
      url: "file:data/finance.db",
    });
  });
  it("accepts a Turso URL with its token", () => {
    expect(
      databaseConfig({
        DATABASE_DRIVER: "turso",
        DATABASE_URL: "libsql://finance.turso.io",
        TURSO_AUTH_TOKEN: "token",
      }),
    ).toEqual({
      driver: "turso",
      url: "libsql://finance.turso.io",
      authToken: "token",
    });
  });
  it("rejects Turso without an auth token", () => {
    expect(() =>
      databaseConfig({
        DATABASE_DRIVER: "turso",
        DATABASE_URL: "libsql://finance.turso.io",
      }),
    ).toThrow("TURSO_AUTH_TOKEN");
  });
});
