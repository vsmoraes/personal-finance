import { ExperimentOutlined, SearchOutlined } from "@ant-design/icons";
import { create, fromJson, toJson } from "@bufbuild/protobuf";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Flex,
  Form,
  Input,
  Modal,
  Space,
  Table,
  type TableProps,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import * as p from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import {
  categoryName,
  request,
  useRefresh,
  useResources,
} from "../shared/api.ts";
import { CategoryIcon } from "../shared/category-icons.tsx";
import { Field, FormFields } from "../shared/forms.tsx";
import { EmptyState, ErrorNotice, PageTitle } from "../shared/ui.tsx";
import { type Entity, type Resource } from "./entity-form.tsx";
import { EntryDrawer } from "./entry-drawer.tsx";
export function Configuration({ resource }: { resource: Resource }) {
  const { t, i18n } = useTranslation();
  const data = useResources(resource);
  const categories = useResources("categories").data?.categories ?? [];
  const refresh = useRefresh(resource);
  const [edit, setEdit] = useState<Entity | "new">();
  const [deleting, setDeleting] = useState<Entity>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const entities: Entity[] = data.data
    ? resource === "categories"
      ? data.data.categories
      : resource === "budgets"
        ? data.data.budgets
        : resource === "recurring-commitments"
          ? data.data.commitments
          : resource === "categorization-rules"
            ? data.data.rules
            : data.data.scenarios
    : [];
  const label = (e: Entity) =>
    e.$typeName === "finance.v1.Category"
      ? categoryName(e, t)
      : e.$typeName === "finance.v1.Budget"
        ? `${categoryName(
            categories.find((c) => c.id === e.categoryId),
            t,
          )} · ${e.startMonth} · ${e.amount?.currencyCode ?? ""}`
        : e.$typeName === "finance.v1.RecurringCommitment"
          ? e.description
          : e.name;
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await request(`${resource}/${deleting.id}`, "DELETE", undefined, {
        "if-match": String(deleting.version),
      });
      refresh();
      setDeleting(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const amount = (value: p.Money | undefined) =>
    value
      ? formatMoney(value.minorUnits, value.currencyCode, i18n.language)
      : t("noBudget");
  const columns: TableProps<Entity>["columns"] = [
    {
      title: t(resource === "budgets" ? "category" : "name"),
      key: "name",
      width: 280,
      render: (_, entity) => (
        <Space>
          {entity.$typeName === "finance.v1.Category" && (
            <CategoryIcon name={entity.icon} />
          )}
          <Typography.Text id={`${resource}-row-${entity.id}`} strong>
            {label(entity)}
          </Typography.Text>
        </Space>
      ),
    },
    ...(resource === "categories"
      ? [
          {
            title: t("type"),
            key: "type",
            width: 120,
            render: (_: unknown, e: Entity) =>
              e.$typeName === "finance.v1.Category" && (
                <Tag bordered={false}>
                  {t(
                    e.type === p.TransactionType.INCOME ? "income" : "expenses",
                  )}
                </Tag>
              ),
          },
          {
            title: t("defaultBudget"),
            key: "budget",
            width: 160,
            render: (_: unknown, e: Entity) =>
              e.$typeName === "finance.v1.Category" && amount(e.defaultBudget),
          },
          {
            title: t("status"),
            key: "status",
            width: 140,
            render: (_: unknown, e: Entity) =>
              e.$typeName === "finance.v1.Category" && (
                <Tag
                  color={e.archived ? "default" : "success"}
                  bordered={false}
                >
                  {t(e.archived ? "archived" : "active")}
                </Tag>
              ),
          },
        ]
      : resource === "categorization-rules"
        ? [
            {
              title: t("priority"),
              key: "priority",
              width: 100,
              render: (_: unknown, e: Entity) =>
                e.$typeName === "finance.v1.CategorizationRule" && e.priority,
            },
            {
              title: t("category"),
              key: "category",
              width: 180,
              render: (_: unknown, e: Entity) =>
                e.$typeName === "finance.v1.CategorizationRule" &&
                categoryName(
                  categories.find((c) => c.id === e.categoryId),
                  t,
                ),
            },
            {
              title: t("status"),
              key: "status",
              width: 120,
              render: (_: unknown, e: Entity) =>
                e.$typeName === "finance.v1.CategorizationRule" && (
                  <Tag
                    bordered={false}
                    color={e.enabled ? "success" : "default"}
                  >
                    {t(e.enabled ? "enabled" : "disabled")}
                  </Tag>
                ),
            },
          ]
        : resource === "scenarios"
          ? [
              {
                title: t("changes"),
                key: "changes",
                width: 140,
                render: (_: unknown, e: Entity) =>
                  e.$typeName === "finance.v1.Scenario" &&
                  t("overrideCount", { count: e.overrides.length }),
              },
              {
                title: t("currency"),
                key: "currency",
                width: 150,
                render: (_: unknown, e: Entity) =>
                  e.$typeName === "finance.v1.Scenario" && (
                    <Space wrap>
                      {[
                        ...new Set(
                          e.overrides.map((o) => o.amount?.currencyCode),
                        ),
                      ].map((currency) => (
                        <Tag key={currency}>{currency}</Tag>
                      ))}
                    </Space>
                  ),
              },
              {
                title: t("forecast"),
                key: "forecast",
                width: 140,
                render: (_: unknown, e: Entity) => (
                  <Button
                    id={`scenario-forecast-${e.id}`}
                    type="link"
                    href={`/forecast?scenarioId=${e.id}`}
                  >
                    {t("viewForecast")}
                  </Button>
                ),
              },
            ]
          : [
              {
                title: t("amount"),
                key: "amount",
                width: 180,
                render: (_: unknown, e: Entity) =>
                  "amount" in e && (
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>
                        {amount(e.amount)}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {e.amount?.currencyCode}
                      </Typography.Text>
                    </Space>
                  ),
              },
              {
                title: t("period"),
                key: "period",
                width: 180,
                render: (_: unknown, e: Entity) =>
                  "startMonth" in e && (
                    <Space direction="vertical" size={0}>
                      <Typography.Text>
                        {e.startMonth} — {e.endMonth || t("ongoing")}
                      </Typography.Text>
                      {e.$typeName === "finance.v1.RecurringCommitment" && (
                        <Typography.Text type="secondary">
                          {t("everyMonths", { count: e.intervalMonths })}
                        </Typography.Text>
                      )}
                    </Space>
                  ),
              },
            ]),
  ];
  const visible = entities
    .filter((entity) =>
      label(entity).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      a.$typeName === "finance.v1.Category" &&
      b.$typeName === "finance.v1.Category"
        ? a.position - b.position
        : 0,
    );
  return (
    <>
      <PageTitle
        title={t(resource === "categories" ? "categoriesTitle" : resource)}
        subtitle={t(`${resource}Description`)}
        actions={
          <Button
            id={`${resource}-create-button`}
            type="primary"
            onClick={() => setEdit("new")}
          >
            + {t("create")}
          </Button>
        }
      />
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {resource === "scenarios" && (
          <Alert
            showIcon
            icon={<ExperimentOutlined />}
            type="info"
            message={t("whatIfExplanation")}
            description={t("whatIfExample")}
          />
        )}
        {error || data.error ? (
          <ErrorNotice error={error ?? data.error} />
        ) : null}
        <Card styles={{ body: { padding: 0 } }}>
          <Flex
            justify="space-between"
            align="center"
            gap="middle"
            wrap
            style={{ padding: 20 }}
          >
            <Input
              id={`${resource}-search`}
              aria-label={t("search")}
              placeholder={t("searchEntries")}
              prefix={<SearchOutlined aria-hidden />}
              value={search}
              allowClear
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 320, maxWidth: "100%" }}
            />
            <Typography.Text type="secondary">
              {t("entryCount", { count: visible.length })}
            </Typography.Text>
          </Flex>
          <Table<Entity>
            rowKey="id"
            loading={data.isPending}
            dataSource={visible}
            columns={columns}
            scroll={{ x: 820 }}
            pagination={{
              pageSize: 12,
              showSizeChanger: false,
              responsive: true,
            }}
            locale={{ emptyText: <EmptyState /> }}
            onRow={(entity) => ({
              onClick: () => setEdit(entity),
              style: { cursor: "pointer" },
            })}
          />
        </Card>
        {resource === "budgets" && (
          <Collapse
            items={[
              {
                key: "copy",
                label: <span id="budget-copy-toggle">{t("copyBudgets")}</span>,
                children: <BudgetCopy />,
              },
            ]}
          />
        )}
        {resource === "categorization-rules" && (
          <Collapse
            items={[
              {
                key: "preview",
                label: (
                  <span id="rules-preview-toggle">{t("previewRules")}</span>
                ),
                children: <RulePreview />,
              },
            ]}
          />
        )}
      </Space>
      <EntryDrawer
        draft={
          edit
            ? { resource, ...(edit === "new" ? {} : { entity: edit }) }
            : undefined
        }
        onClose={() => setEdit(undefined)}
        onDelete={() => {
          if (edit && edit !== "new") {
            setEdit(undefined);
            setDeleting(edit);
          }
        }}
      />
      <Modal
        title={t(resource === "categories" ? "archive" : "delete")}
        open={Boolean(deleting)}
        onCancel={() => setDeleting(undefined)}
        onOk={() => {
          void remove();
        }}
        okText={t(resource === "categories" ? "archive" : "delete")}
        cancelText={t("cancel")}
        okButtonProps={{
          id: `${resource}-delete-confirm`,
          danger: true,
          loading: busy,
        }}
      >
        <Typography.Paragraph>{t("deleteConfirmation")}</Typography.Paragraph>
      </Modal>
    </>
  );
}
function BudgetCopy() {
  const { t } = useTranslation();
  const refresh = useRefresh("budgets");
  const [error, setError] = useState<unknown>();
  const form = useForm({
    defaultValues: {
      sourceMonth: "",
      targetMonths: "",
      sourceYear: "",
      targetYear: "",
    },
  });
  const submit = form.handleSubmit(async (v) => {
    try {
      await request(
        "budgets/copy",
        "POST",
        toJson(
          p.BudgetCopyRequestSchema,
          create(p.BudgetCopyRequestSchema, {
            sourceMonth: v.sourceMonth,
            targetMonths: v.targetMonths
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            sourceYear: Number(v.sourceYear),
            targetYear: Number(v.targetYear),
          }),
        ),
      );
      refresh();
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  });
  return (
    <Card className="finance-form-surface" title={t("copyBudgets")}>
      <Form
        className="finance-standard-form"
        layout="vertical"
        onFinish={() => {
          void submit();
        }}
      >
        <FormFields>
          {error ? <ErrorNotice error={error} /> : null}
          <Field
            control={form.control}
            name="sourceMonth"
            label="sourceMonth"
            type="month"
          />
          <Field
            control={form.control}
            name="targetMonths"
            label="targetMonths"
          />
          <Field
            control={form.control}
            name="sourceYear"
            label="sourceYear"
            type="number"
          />
          <Field
            control={form.control}
            name="targetYear"
            label="targetYear"
            type="number"
          />
          <Button
            id="budget-copy-submit"
            htmlType="submit"
            loading={form.formState.isSubmitting}
          >
            {t("copy")}
          </Button>
        </FormFields>
      </Form>
    </Card>
  );
}
function RulePreview() {
  const { t } = useTranslation();
  const refresh = useRefresh("categorization-rules");
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<p.RulePreviewResponse>();
  const [error, setError] = useState<unknown>();
  async function run(apply: boolean) {
    try {
      setPreview(
        fromJson(
          p.RulePreviewResponseSchema,
          await request(
            "categorization-rules/preview",
            "POST",
            toJson(
              p.BulkRequestSchema,
              create(p.BulkRequestSchema, {
                overwriteManual: overwrite,
                apply,
              }),
            ),
          ),
        ),
      );
      if (apply) refresh();
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Card className="finance-form-surface" title={t("previewRules")}>
      <Form.Item>
        <Checkbox
          id="rules-overwrite-manual"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
        >
          {t("overwriteManual")}
        </Checkbox>
      </Form.Item>
      <Flex gap="small" wrap>
        <Button
          id="rules-preview-button"
          onClick={() => {
            void run(false);
          }}
        >
          {t("preview")}
        </Button>
        <Button
          id="rules-apply-button"
          disabled={!preview}
          onClick={() => {
            void run(true);
          }}
        >
          {t("applyRules")}
        </Button>
      </Flex>
      {error ? <ErrorNotice error={error} /> : null}
      {preview && (
        <>
          <Typography.Paragraph>
            {t("matches", { count: preview.matches.length })}
          </Typography.Paragraph>
          {preview.matches.map((match, index) => (
            <Typography.Paragraph key={index}>
              {match.transactionId.slice(0, 8)} ·{" "}
              {match.reasons.map((r) => t(r)).join(", ")}
            </Typography.Paragraph>
          ))}
        </>
      )}
    </Card>
  );
}
