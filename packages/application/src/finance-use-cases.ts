import type * as p from "../../contracts/src/finance/v1/finance_pb.js";
import type { ResourceMap } from "./ports.js";

/**
 * Driving port implemented by the application core. Adapters depend on this
 * contract, never on the concrete composition type.
 */
export interface FinanceUseCases {
  readonly imports: ImportUseCases;
  list<K extends keyof ResourceMap>(resource: K): Promise<ResourceMap[K][]>;
  get<K extends keyof ResourceMap>(
    resource: K,
    id: string,
  ): Promise<ResourceMap[K]>;
  save<K extends keyof ResourceMap>(
    resource: K,
    input: ResourceMap[K],
    id?: string,
  ): Promise<ResourceMap[K]>;
  remove<K extends keyof ResourceMap>(
    resource: K,
    id: string,
    version: number,
  ): Promise<void>;
  settings(): Promise<p.Settings>;
  updateSettings(settings: p.Settings): Promise<p.Settings>;
  transactions(filter: p.ListRequest): Promise<p.FinanceResponse>;
  createTransaction(input: p.Transaction, key: string): Promise<p.Transaction>;
  updateTransaction(id: string, input: p.Transaction): Promise<p.Transaction>;
  recategorize(input: p.BulkRequest): Promise<void>;
  previewRules(input: p.BulkRequest): Promise<p.RulePreviewResponse>;
  putBudget(year: string, month: string, input: p.Budget): Promise<p.Budget>;
  copyBudgets(input: p.BudgetCopyRequest): Promise<void>;
  report(kind: ReportKind, request: p.ReportRequest): Promise<p.ReportResponse>;
  export(): Promise<p.FinanceResponse>;
}

export interface ImportUseCases {
  get(id: string): Promise<p.ImportResponse>;
  preview(request: p.ImportRequest): Promise<p.ImportResponse>;
  confirm(id: string): Promise<p.ImportResponse>;
}

export type ReportKind = "dashboard" | "monthly" | "categories" | "forecast";
