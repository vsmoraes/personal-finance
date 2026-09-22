import { databaseConfig } from "../../../packages/database/src/config.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const { app } = await buildApp({ config: databaseConfig(), logger: true });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      void app.close().then(() => {
        process.exitCode = 0;
      });
    });
  }
  try {
    await app.listen({
      port: Number(process.env["PORT"] ?? 8080),
      host: process.env["HOST"] ?? "127.0.0.1",
    });
  } catch {
    app.log.error("Server startup failed");
    await app.close();
    process.exitCode = 1;
  }
}
void main().catch(() => {
  process.stderr.write(
    "Application initialization failed. Check configuration and data-directory permissions.\n",
  );
  process.exitCode = 1;
});
