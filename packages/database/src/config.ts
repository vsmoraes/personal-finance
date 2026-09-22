export type DatabaseDriver = "sqlite" | "turso";

export type DatabaseConfig =
  | { driver: "sqlite"; url: string }
  | { driver: "turso"; url: string; authToken: string };

export function databaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const driver = env["DATABASE_DRIVER"] ?? "sqlite";
  const url = env["DATABASE_URL"] ?? "file:data/finance.db";
  if (driver === "sqlite") {
    if (!url.startsWith("file:") && url !== ":memory:")
      throw new Error(
        "DATABASE_URL must be a file URL when DATABASE_DRIVER=sqlite",
      );
    return { driver, url };
  }
  if (driver === "turso") {
    if (!url.startsWith("libsql:") && !url.startsWith("https:"))
      throw new Error(
        "DATABASE_URL must be a libsql or https URL when DATABASE_DRIVER=turso",
      );
    const authToken = env["TURSO_AUTH_TOKEN"];
    if (!authToken)
      throw new Error(
        "TURSO_AUTH_TOKEN is required when DATABASE_DRIVER=turso",
      );
    return { driver, url, authToken };
  }
  throw new Error("DATABASE_DRIVER must be sqlite or turso");
}
