import { spawn, spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const entrypoint = "apps/api/src/main.ts";
const environment = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_DRIVER: "sqlite",
  DATABASE_URL: ":memory:",
  GOOGLE_CLIENT_ID: "test-client-id",
  APP_ORIGIN: "http://localhost:8080",
  HOST: "127.0.0.1",
  PORT: "0",
};

function runWith(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", entrypoint], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("startup diagnostics", () => {
  it("reports configuration failures with their actual cause", () => {
    const result = runWith({
      ...environment,
      DATABASE_DRIVER: "turso",
      DATABASE_URL: "libsql://private-host.example",
      TURSO_AUTH_TOKEN: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Application initialization failed");
    expect(result.stderr).toContain("TURSO_AUTH_TOKEN is required");
    expect(result.stderr).not.toContain("private-host.example");
  });

  it("reports initialization failures instead of hiding them", () => {
    const result = runWith({ ...environment, GOOGLE_CLIENT_ID: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Application initialization failed");
    expect(result.stderr).toContain("GOOGLE_CLIENT_ID is required");
  });

  it("does not include configured database URLs in error details", () => {
    const secretUrl = "file:/dev/null/private-database-name";
    const result = runWith({ ...environment, DATABASE_URL: secretUrl });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Application initialization failed");
    expect(result.stderr).not.toContain(secretUrl);
  });

  it("uses Fastify logging for listener failures", () => {
    const result = runWith({ ...environment, PORT: "invalid" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Application startup failed");
    expect(result.stdout).toContain('"err"');
  });

  it("logs that the listener and readiness probe succeeded", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", entrypoint], {
      cwd: process.cwd(),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    let requestedShutdown = false;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
      if (
        !requestedShutdown &&
        output.includes("Application ready to receive requests")
      ) {
        requestedShutdown = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      errors += chunk;
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 8_000);
    try {
      const code = await new Promise<number | null>((resolve) => {
        child.once("exit", resolve);
      });
      expect(code).toBe(0);
      expect(errors).toBe("");
      expect(output).toContain("Server listening at");
      expect(output).toContain("Application ready to receive requests");
      expect(output).toContain("Application stopped");
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill("SIGTERM");
    }
  });
});
