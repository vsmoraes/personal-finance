/* eslint-disable @typescript-eslint/require-await */
import { createHash, randomUUID } from "node:crypto";

import type { Client } from "@libsql/client";

import type { Store } from "./index.js";

export type AuthUser = { id: string; displayName: string; pictureUrl: string };
export type GoogleProfile = { sub: string; name?: string; picture?: string };
export type AuthDatabase = {
  findOrCreateUser(profile: GoogleProfile): Promise<AuthUser>;
  createSession(
    userId: string,
    token: string,
    expiresAt: string,
  ): Promise<void>;
  sessionUser(token: string): Promise<AuthUser | undefined>;
  deleteSession(token: string): Promise<void>;
};

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function databaseText(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_USER_ROW");
  return value;
}
const safeName = (profile: GoogleProfile) =>
  profile.name?.trim().slice(0, 160) || "Google user";
const safePicture = (profile: GoogleProfile) => {
  try {
    const url = new URL(profile.picture ?? "");
    return url.protocol === "https:" &&
      url.hostname.endsWith(".googleusercontent.com")
      ? url.href
      : "";
  } catch {
    return "";
  }
};

export function sqliteAuth(store: Store): AuthDatabase {
  const db = store.sqlite;
  return {
    async findOrCreateUser(profile) {
      const current = db
        .prepare("SELECT id FROM users WHERE google_sub = ?")
        .get(profile.sub) as { id: string } | undefined;
      const id = current?.id ?? randomUUID();
      if (!current)
        db.prepare(
          "INSERT INTO users (id, google_sub, display_name, picture_url, created_at) VALUES (?, ?, ?, ?, ?)",
        ).run(
          id,
          profile.sub,
          safeName(profile),
          safePicture(profile),
          new Date().toISOString(),
        );
      else
        db.prepare(
          "UPDATE users SET display_name = ?, picture_url = ? WHERE id = ?",
        ).run(safeName(profile), safePicture(profile), id);
      return {
        id,
        displayName: safeName(profile),
        pictureUrl: safePicture(profile),
      };
    },
    async createSession(userId, token, expiresAt) {
      db.prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      ).run(hash(token), userId, expiresAt);
    },
    async sessionUser(token) {
      return db
        .prepare(
          "SELECT users.id, users.display_name AS displayName, users.picture_url AS pictureUrl FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
        )
        .get(hash(token), new Date().toISOString()) as AuthUser | undefined;
    },
    async deleteSession(token) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
    },
  };
}

export function tursoAuth(client: Client): AuthDatabase {
  return {
    async findOrCreateUser(profile) {
      const id = randomUUID();
      await client.execute({
        sql: "INSERT INTO users (id, google_sub, display_name, picture_url, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET display_name = excluded.display_name, picture_url = excluded.picture_url",
        args: [
          id,
          profile.sub,
          safeName(profile),
          safePicture(profile),
          new Date().toISOString(),
        ],
      });
      const found = await client.execute({
        sql: "SELECT id, display_name, picture_url FROM users WHERE google_sub = ?",
        args: [profile.sub],
      });
      const row = found.rows[0];
      if (!row) throw new Error("USER_CREATE_FAILED");
      return {
        id: databaseText(row["id"]),
        displayName: databaseText(row["display_name"]),
        pictureUrl: databaseText(row["picture_url"]),
      };
    },
    async createSession(userId, token, expiresAt) {
      await client.execute({
        sql: "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        args: [hash(token), userId, expiresAt],
      });
    },
    async sessionUser(token) {
      const found = await client.execute({
        sql: "SELECT users.id, users.display_name, users.picture_url FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
        args: [hash(token), new Date().toISOString()],
      });
      const row = found.rows[0];
      return row
        ? {
            id: databaseText(row["id"]),
            displayName: databaseText(row["display_name"]),
            pictureUrl: databaseText(row["picture_url"]),
          }
        : undefined;
    },
    async deleteSession(token) {
      await client.execute({
        sql: "DELETE FROM sessions WHERE token_hash = ?",
        args: [hash(token)],
      });
    },
  };
}
