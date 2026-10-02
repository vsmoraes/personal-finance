import { databaseConfig } from "../../../packages/database/src/config.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const { app } = await buildApp({ config: databaseConfig(), logger: true });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      void app.close().then(
        () => {
          app.log.info({ signal }, "Application stopped");
          process.exitCode = 0;
        },
        (error: unknown) => {
          app.log.error({ err: error, signal }, "Application shutdown failed");
          process.exitCode = 1;
        },
      );
    });
  }
  try {
    await app.listen({
      port: Number(process.env["PORT"] ?? 8080),
      host: process.env["HOST"] ?? "127.0.0.1",
    });
    // listen() waits for Fastify to finish registering routes and plugins.
    // Fastify also writes its own "Server listening" log at this point.
    app.log.info("Application ready to receive requests");
  } catch (error) {
    app.log.error({ err: error }, "Application startup failed");
    await app.close();
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  // Configuration/database failures occur before the Fastify logger exists.
  let details =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  for (const key of ["GOOGLE_CLIENT_ID", "TURSO_AUTH_TOKEN", "DATABASE_URL"]) {
    const value = process.env[key];
    if (value) details = details.replaceAll(value, "[redacted]");
  }
  process.stderr.write(`Application initialization failed: ${details}\n`);
  process.exitCode = 1;
});
