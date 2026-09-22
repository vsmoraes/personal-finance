import type { Transaction } from "../../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import type { Entity, Resource } from "../entity-form.tsx";

export type EntryDraft =
  | { resource: "transactions"; entity?: Transaction }
  | { resource: Resource; entity?: Entity };
