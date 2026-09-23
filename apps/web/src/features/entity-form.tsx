import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import {
  App as AntApp,
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Flex,
  Form,
  Input,
  Select,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import * as p from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import {
  decimalAmount,
  parseAmount,
} from "../../../../packages/domain/src/money.ts";
import {
  categoryName,
  request,
  useRefresh,
  useResources,
  useSettings,
} from "../shared/api.ts";
import { Field, FormField, FormFields, type Option } from "../shared/forms.tsx";
import { ErrorNotice } from "../shared/ui.tsx";
export type Resource =
  | "categories"
  | "budgets"
  | "recurring-commitments"
  | "categorization-rules"
  | "scenarios";
type Values = Record<string, string | boolean>;
type FieldDefinition = {
  key: string;
  type?: string;
  required?: boolean;
  options?: Option[];
};
export type Entity =
  | p.Category
  | p.Budget
  | p.RecurringCommitment
  | p.CategorizationRule
  | p.Scenario;
function fields(
  resource: Resource,
  categoryOptions: Option[],
  t: (key: string) => string,
): FieldDefinition[] {
  const name = { key: "name", required: true };
  const category = {
    key: "categoryId",
    options: categoryOptions,
    required: true,
  };
  const amount = { key: "amount", type: "decimal", required: true };
  const month = { key: "startMonth", type: "month", required: true };
  switch (resource) {
    case "categories":
      return [
        name,
        {
          key: "type",
          options: [
            { value: "1", label: t("income") },
            { value: "2", label: t("expenses") },
          ],
        },
        { key: "color", type: "color" },
        { key: "icon", type: "icon" },
        { key: "budgetable", type: "checkbox" },
        { key: "defaultBudget", type: "decimal" },
        { key: "position", type: "number" },
        { key: "archived", type: "checkbox" },
      ];
    case "budgets":
      return [category, amount, month, { key: "endMonth", type: "month" }];
    case "recurring-commitments":
      return [
        category,
        { key: "description", required: true },
        amount,
        month,
        { key: "endMonth", type: "month" },
        { key: "intervalMonths", type: "number", required: true },
        { key: "contributesToBudget", type: "checkbox" },
      ];
    case "categorization-rules":
      return [
        name,
        category,
        { key: "priority", type: "number", required: true },
        { key: "enabled", type: "checkbox" },
        { key: "counterpartyContains" },
        { key: "noteContains" },
        { key: "importSourceContains" },
        { key: "minMinorUnits", type: "number" },
        { key: "maxMinorUnits", type: "number" },
        {
          key: "budgetControl",
          options: [
            { value: "keep", label: t("keepBudgetInclusion") },
            { value: "yes", label: t("includeInBudget") },
            { value: "no", label: t("excludeFromBudget") },
          ],
        },
        { key: "continueMatching", type: "checkbox" },
      ];
    case "scenarios":
      return [name];
  }
}
export function EntityForm({
  resource,
  entity,
  onSaved,
}: {
  resource: Resource;
  entity: Entity | undefined;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const refresh = useRefresh(resource);
  const defaultCurrency = useSettings().data?.defaultCurrency ?? "EUR";
  const categories = useResources("categories").data?.categories ?? [];
  const [error, setError] = useState<unknown>();
  const [overrides, setOverrides] = useState(() =>
    entity?.$typeName === "finance.v1.Scenario"
      ? entity.overrides.map((o) => ({
          month: o.month,
          categoryId: o.categoryId,
          amount: o.amount
            ? decimalAmount(o.amount.minorUnits, o.amount.currencyCode)
            : "",
          additional: o.additional,
          currency: defaultCurrency,
        }))
      : [],
  );
  const initial: Values = {
    name: "",
    type: "2",
    color: "#3959a8",
    icon: "TagOutlined",
    budgetable: true,
    archived: false,
    position: "0",
    categoryId: "",
    amount: "",
    currency: defaultCurrency,
    defaultBudget: "",
    startMonth: new Date().toISOString().slice(0, 7),
    endMonth: "",
    description: "",
    intervalMonths: "1",
    contributesToBudget: true,
    priority: "0",
    enabled: true,
    counterpartyContains: "",
    noteContains: "",
    importSourceContains: "",
    minMinorUnits: "",
    maxMinorUnits: "",
    currencyCode: "",
    budgetControl: "keep",
    continueMatching: false,
    rate: "",
    date: new Date().toISOString().slice(0, 10),
  };
  if (entity) {
    for (const [key, value] of Object.entries(entity)) {
      if (typeof value === "string" || typeof value === "boolean")
        initial[key] = value;
      else if (typeof value === "number" || typeof value === "bigint")
        initial[key] = String(value);
    }
    if (entity.$typeName === "finance.v1.Category") {
      initial["name"] = categoryName(entity, t);
      initial["defaultBudget"] = entity.defaultBudget
        ? decimalAmount(
            entity.defaultBudget.minorUnits,
            entity.defaultBudget.currencyCode,
          )
        : "";
    }
    if ("amount" in entity && entity.amount) {
      initial["amount"] = decimalAmount(
        entity.amount.minorUnits,
        entity.amount.currencyCode,
      );
    }
    if (entity.$typeName === "finance.v1.CategorizationRule")
      initial["budgetControl"] =
        entity.includeInBudget === undefined
          ? "keep"
          : entity.includeInBudget
            ? "yes"
            : "no";
  }
  const form = useForm<Values>({ defaultValues: initial });
  const categoryOptions = categories
    .filter((c) => !c.archived)
    .map((c) => ({ value: c.id, label: categoryName(c, t) }));
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    try {
      const s = (key: string) => String(values[key] ?? "");
      const b = (key: string) => Boolean(values[key]);
      const n = (key: string) => Number(s(key));
      const money = (key: string, currency = s("currency")) => ({
        minorUnits: parseAmount(s(key), currency).toString(),
        currencyCode: currency,
      });
      let payload: JsonValue;
      const common = { id: entity?.id ?? "", version: entity?.version ?? 0 };
      switch (resource) {
        case "categories":
          payload = {
            ...common,
            name: s("name"),
            type: n("type"),
            color: s("color"),
            icon: s("icon"),
            budgetable: b("budgetable"),
            archived: b("archived"),
            position: n("position"),
            ...(s("defaultBudget")
              ? { defaultBudget: money("defaultBudget") }
              : {}),
          };
          break;
        case "budgets":
          payload = {
            ...common,
            categoryId: s("categoryId"),
            amount: money("amount"),
            startMonth: s("startMonth"),
            endMonth: s("endMonth"),
          };
          break;
        case "recurring-commitments":
          payload = {
            ...common,
            categoryId: s("categoryId"),
            description: s("description"),
            amount: money("amount", s("currency")),
            startMonth: s("startMonth"),
            endMonth: s("endMonth"),
            intervalMonths: n("intervalMonths"),
            contributesToBudget: b("contributesToBudget"),
          };
          break;
        case "categorization-rules":
          payload = {
            ...common,
            name: s("name"),
            categoryId: s("categoryId"),
            priority: n("priority"),
            enabled: b("enabled"),
            counterpartyContains: s("counterpartyContains"),
            noteContains: s("noteContains"),
            importSourceContains: s("importSourceContains"),
            currencyCode: "",
            ...(s("minMinorUnits")
              ? { minMinorUnits: s("minMinorUnits") }
              : {}),
            ...(s("maxMinorUnits")
              ? { maxMinorUnits: s("maxMinorUnits") }
              : {}),
            ...(s("budgetControl") === "keep"
              ? {}
              : { includeInBudget: s("budgetControl") === "yes" }),
            continueMatching: b("continueMatching"),
          };
          break;
        case "scenarios":
          payload = {
            ...common,
            name: s("name"),
            overrides: overrides.map((o) => ({
              month: o.month,
              categoryId: o.categoryId,
              additional: o.additional,
              amount: {
                minorUnits: parseAmount(o.amount, o.currency).toString(),
                currencyCode: defaultCurrency,
              },
            })),
          };
          break;
      }
      // Round-trip through the generated descriptor before crossing the REST boundary.
      const schemas = {
        categories: p.CategorySchema,
        budgets: p.BudgetSchema,
        "recurring-commitments": p.RecurringCommitmentSchema,
        "categorization-rules": p.CategorizationRuleSchema,
        scenarios: p.ScenarioSchema,
      };
      const schema = schemas[resource];
      payload = toJson(schema, fromJson(schema, payload));
      await request(
        entity ? `${resource}/${entity.id}` : resource,
        entity ? "PATCH" : "POST",
        payload,
      );
      refresh();
      void message.success(t("saved"));
      onSaved();
    } catch (e) {
      setError(e);
    }
  });
  return (
    <Form
      className="finance-standard-form"
      layout="vertical"
      onFinish={() => {
        void submit();
      }}
    >
      {error ? <ErrorNotice error={error} /> : null}
      <Collapse
        defaultActiveKey={["details", "rules", "overrides"]}
        items={[
          {
            key: "details",
            label: t("entryDetails"),
            children: (
              <FormFields>
                {fields(resource, categoryOptions, t).map((f) => (
                  <Field
                    key={f.key}
                    control={form.control}
                    name={f.key}
                    label={f.key}
                    {...(f.type ? { type: f.type } : {})}
                    {...(f.options ? { options: f.options } : {})}
                    required={Boolean(f.required)}
                  />
                ))}
              </FormFields>
            ),
          },
          ...(resource === "scenarios"
            ? [
                {
                  key: "overrides",
                  label: t("scenarioOverrides"),
                  children: (
                    <Flex vertical gap="middle">
                      <Typography.Paragraph>
                        {t("scenarioHelp")}
                      </Typography.Paragraph>
                      {overrides.map((o, index) => (
                        <Flex vertical gap="middle" key={index}>
                          <FormField label="month">
                            <DatePicker
                              id={`override-month-${index}`}
                              picker="month"
                              format="YYYY-MM"
                              value={o.month ? dayjs(o.month) : null}
                              onChange={(value) =>
                                setOverrides((old) =>
                                  old.map((v, i) =>
                                    i === index
                                      ? {
                                          ...v,
                                          month: value?.format("YYYY-MM") ?? "",
                                        }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </FormField>
                          <FormField label="category">
                            <Select
                              id={`override-category-${index}`}
                              value={o.categoryId || null}
                              placeholder={t("selectCategory")}
                              options={categoryOptions}
                              onChange={(value: string) =>
                                setOverrides((old) =>
                                  old.map((v, i) =>
                                    i === index
                                      ? { ...v, categoryId: value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </FormField>
                          <FormField label="amount">
                            <Input
                              id={`override-amount-${index}`}
                              inputMode="decimal"
                              value={o.amount}
                              onChange={(e) =>
                                setOverrides((old) =>
                                  old.map((v, i) =>
                                    i === index
                                      ? { ...v, amount: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </FormField>
                          <FormField>
                            <Checkbox
                              checked={o.additional}
                              onChange={(e) =>
                                setOverrides((old) =>
                                  old.map((v, i) =>
                                    i === index
                                      ? { ...v, additional: e.target.checked }
                                      : v,
                                  ),
                                )
                              }
                            >
                              {t("additional")}
                            </Checkbox>
                          </FormField>
                          <Button
                            danger
                            onClick={() =>
                              setOverrides((old) =>
                                old.filter((_, i) => i !== index),
                              )
                            }
                          >
                            {t("remove")}
                          </Button>
                        </Flex>
                      ))}
                      <Button
                        onClick={() =>
                          setOverrides((old) => [
                            ...old,
                            {
                              month: "",
                              categoryId: "",
                              amount: "",
                              additional: false,
                              currency: defaultCurrency,
                            },
                          ])
                        }
                      >
                        {t("addOverride")}
                      </Button>
                    </Flex>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Button
        id={`${resource}-form-save`}
        type="primary"
        htmlType="submit"
        loading={form.formState.isSubmitting}
      >
        {t("save")}
      </Button>
    </Form>
  );
}
