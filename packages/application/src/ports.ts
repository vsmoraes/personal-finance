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
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(
    value: T,
    expectedVersion?: number,
    deduplicationKey?: string,
  ): Promise<void>;
  remove(id: string, expectedVersion: number): Promise<void>;
}
export type Repositories = {
  [K in keyof ResourceMap]: Repository<ResourceMap[K]>;
};
export interface FinanceStore {
  repositories: Repositories;
  atomic<T>(operation: () => Promise<T>): Promise<T>;
  settings(): Promise<p.Settings>;
  saveSettings(settings: p.Settings, expectedVersion: number): Promise<void>;
  audit(entity: string, action: string, entityId: string): Promise<void>;
  deduplicationKeys(): Promise<string[]>;
  getIdempotency(
    key: string,
  ): Promise<{ hash: string; payload: string } | undefined>;
  saveIdempotency(key: string, hash: string, payload: string): Promise<void>;
  getImport(id: string): Promise<p.ImportResponse | undefined>;
  saveImport(value: p.ImportResponse, request?: p.ImportRequest): Promise<void>;
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
