import { assert, DomainError } from "../../domain/src/money.js";
import type { FinanceStore, ResourceMap, Runtime } from "./ports.js";
import type { Service } from "./service.js";

/** Resource lifecycle use cases shared by every configured finance resource. */
export class ResourceUseCases {
  constructor(
    private readonly store: FinanceStore,
    private readonly runtime: Runtime,
    private readonly service: Service,
  ) {}

  async list<K extends keyof ResourceMap>(
    resource: K,
  ): Promise<ResourceMap[K][]> {
    return this.store.repositories[resource].list();
  }

  async get<K extends keyof ResourceMap>(
    resource: K,
    id: string,
  ): Promise<ResourceMap[K]> {
    const value = await this.store.repositories[resource].get(id);
    assert(value, "NOT_FOUND", 404);
    return value;
  }

  save<K extends keyof ResourceMap>(
    resource: K,
    input: ResourceMap[K],
    id?: string,
  ): Promise<ResourceMap[K]> {
    return this.store.atomic(async () => {
      const previous = id ? await this.get(resource, id) : undefined;
      if (previous) assert(input.version === previous.version, "CONFLICT", 409);
      input.id = id ?? this.runtime.id();
      input.version = (previous?.version ?? 0) + 1;
      switch (input.$typeName) {
        case "finance.v1.Category":
          await this.service.validateCategory(
            input,
            previous?.$typeName === "finance.v1.Category"
              ? previous
              : undefined,
          );
          break;
        case "finance.v1.Budget":
          await this.service.validateBudget(input);
          break;
        case "finance.v1.RecurringCommitment":
          await this.service.validateCommitment(input);
          break;
        case "finance.v1.CategorizationRule":
          await this.service.validateRule(input);
          break;
        case "finance.v1.Scenario":
          await this.service.validateScenario(input);
          break;
        default:
          throw new DomainError("INVALID_RESOURCE");
      }
      await this.store.repositories[resource].save(input, previous?.version);
      await this.store.audit(
        resource,
        previous ? "update" : "create",
        input.id,
      );
      return input;
    });
  }

  remove<K extends keyof ResourceMap>(
    resource: K,
    id: string,
    version: number,
  ): Promise<void> {
    return this.store.atomic(async () => {
      const value = await this.get(resource, id);
      assert(value.version === version, "CONFLICT", 409);
      if (value.$typeName === "finance.v1.Category") {
        value.archived = true;
        value.version++;
        await this.store.repositories.categories.save(value, version);
      } else await this.store.repositories[resource].remove(id, version);
      await this.store.audit(resource, "delete", id);
    });
  }
}
