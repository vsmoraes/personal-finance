import type * as p from "../../contracts/src/finance/v1/finance_pb.js";
/** Persistence boundary. Adapters must preserve atomicity and compare versions on updates. */
export interface ResourceMap {
  categories: p.Category;
  transactions: p.Transaction;
  budgets: p.Budget;
  commitments: p.RecurringCommitment;
  rules: p.CategorizationRule;
  scenarios: p.Scenario;
}
export interface Repository<T extends { id: string; version: number }> {
  list(): T[];
  get(id: string): T | undefined;
  save(value: T, expectedVersion?: number, deduplicationKey?: string): void;
  remove(id: string, expectedVersion: number): void;
}
export type Repositories = {
  [K in keyof ResourceMap]: Repository<ResourceMap[K]>;
};
export interface FinanceStore {
  repositories: Repositories;
  atomic<T>(operation: () => T): T;
  settings(): p.Settings;
  saveSettings(settings: p.Settings, expectedVersion: number): void;
  audit(entity: string, action: string, entityId: string): void;
  deduplicationKeys(): string[];
  getIdempotency(key: string): { hash: string; payload: string } | undefined;
  saveIdempotency(key: string, hash: string, payload: string): void;
  getImport(id: string): p.ImportResponse | undefined;
  saveImport(value: p.ImportResponse, request?: p.ImportRequest): void;
}
export interface Runtime {
  id(): string;
  now(): string;
  hash(value: string): string;
}
export interface ImportAdapter {
  decode(request: p.ImportRequest): {
    records: string[][];
    encoding: string;
    delimiter: string;
  };
}
