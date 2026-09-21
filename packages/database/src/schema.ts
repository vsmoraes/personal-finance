import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
});
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    date: text("date").notNull(),
    type: integer("type").notNull(),
    currency: text("currency").notNull(),
    amount: text("amount").notNull(),
    counterparty: text("counterparty").notNull(),
    payload: text("payload").notNull(),
    version: integer("version").notNull(),
    dedup: text("dedup"),
  },
  (t) => [
    uniqueIndex("transactions_dedup").on(t.dedup),
    index("transactions_date").on(t.date, t.id),
    index("transactions_category").on(t.categoryId),
  ],
);
export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
});
export const commitments = sqliteTable("recurring_commitments", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
});
export const rules = sqliteTable("categorization_rules", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
});
export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
});
export const settings = sqliteTable("application_settings", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
});
export const imports = sqliteTable("imports", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  request: text("request").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});
export const importRows = sqliteTable("import_rows", {
  id: text("id").primaryKey(),
  importId: text("import_id")
    .notNull()
    .references(() => imports.id),
  payload: text("payload").notNull(),
});
export const audit = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: text("created_at").notNull(),
});
export const idempotency = sqliteTable("idempotency_keys", {
  id: text("id").primaryKey(),
  hash: text("hash").notNull(),
  payload: text("payload").notNull(),
});
