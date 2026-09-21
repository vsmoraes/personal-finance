import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  LineChartOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Flex,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  theme,
  Typography,
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ReportResponseSchema,
  type ReportRow,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import {
  categoryName,
  getMessage,
  useResources,
  useSettings,
} from "../shared/api.ts";
import { currencies } from "../shared/forms.tsx";
import { ErrorNotice, Loading, PageTitle } from "../shared/ui.tsx";
import { type EntryDraft, EntryDrawer } from "./entry-drawer.tsx";
import { ReportChart } from "./report-chart.tsx";
import { TransactionTable } from "./transaction-table.tsx";
export function Reports({
  kind = "dashboard",
}: {
  kind?: "dashboard" | "monthly" | "categories" | "forecast";
}) {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const settings = useSettings().data;
  const [year, setYear] = useState(
    settings?.reportYear ?? new Date().getFullYear(),
  );
  const [currency, setCurrency] = useState(settings?.defaultCurrency ?? "EUR");
  const [month, setMonth] = useState(0);
  const [scenario, setScenario] = useState(
    () => new URLSearchParams(window.location.search).get("scenarioId") ?? "",
  );
  const [draft, setDraft] = useState<EntryDraft>();
  const categories = useResources("categories").data?.categories ?? [];
  const scenarios = useResources("scenarios").data?.scenarios ?? [];
  const report = useQuery({
    queryKey: ["report", kind, year, month, scenario, currency],
    queryFn: () =>
      getMessage(
        `reports/${kind}?year=${year}&month=${kind === "categories" ? month : 0}&scenarioId=${scenario}&currencyCode=${currency}`,
        ReportResponseSchema,
      ),
  });
  const money = (value: bigint | undefined) =>
    value === undefined
      ? t("noBudget")
      : formatMoney(
          value,
          report.data?.currencyCode ?? currency,
          i18n.language,
        );
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${key}-01T12:00:00Z`));
  const label = (row: ReportRow) =>
    kind === "categories"
      ? categoryName(
          categories.find((c) => c.id === row.key),
          t,
        )
      : monthLabel(row.key);
  const rows = report.data?.rows ?? [];
  // Charts receive detail rows only. Bigints remain authoritative; numeric projections are display-only.
  const chart = rows.map((row) => ({
    name: label(row),
    income: Number(row.income),
    expenses: Number(row.expenses),
    netSavings: Number(row.netSavings),
    variance: row.variance === undefined ? null : Number(row.variance),
  }));
  const tooltip = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? money(BigInt(Math.round(value)))
      : t("noBudget");
  const columns = [
    ...(kind === "forecast"
      ? [
          {
            title: t("type"),
            key: "status",
            render: (_: unknown, row: ReportRow) =>
              row.key === "total" ? (
                t("forecast")
              ) : (
                <Tag>{t(row.actual ? "actual" : "forecast")}</Tag>
              ),
          },
        ]
      : []),
    {
      title: t(kind === "categories" ? "category" : "month"),
      key: "label",
      render: (_: unknown, r: ReportRow) =>
        r.key === "total" ? t("totalYear") : label(r),
    },
    ...(kind === "categories"
      ? []
      : [
          {
            title: t("income"),
            key: "income",
            render: (_: unknown, r: ReportRow) => money(r.income),
          },
        ]),
    {
      title: t("expenses"),
      key: "expenses",
      render: (_: unknown, r: ReportRow) => money(r.expenses),
    },
    ...(kind === "categories"
      ? []
      : [
          {
            title: t("netSavings"),
            key: "netSavings",
            render: (_: unknown, r: ReportRow) => money(r.netSavings),
          },
        ]),
    {
      title: t("budget"),
      key: "budget",
      render: (_: unknown, r: ReportRow) => money(r.budget),
    },
    {
      title: t("variance"),
      key: "variance",
      render: (_: unknown, r: ReportRow) => money(r.variance),
    },
  ];
  const totals = report.data?.totals;
  const includedSpending =
    totals?.budget !== undefined && totals.variance !== undefined
      ? totals.budget - totals.variance
      : 0n;
  const budgetPercent = totals?.budget
    ? Number((includedSpending * 10000n) / totals.budget) / 100
    : includedSpending > 0n
      ? 100
      : 0;
  return (
    <>
      <PageTitle
        title={t(kind === "categories" ? "categoryReport" : kind)}
        subtitle={t(`${kind}Description`)}
        actions={null}
      />
      <Flex
        align="center"
        justify="space-between"
        gap="middle"
        wrap
        style={{ marginBottom: 24 }}
      >
        <Space wrap>
          <Select
            aria-label={t("year")}
            value={year}
            onChange={setYear}
            style={{ width: 110 }}
            options={Array.from({ length: 21 }, (_, i) => ({
              value: new Date().getFullYear() - 10 + i,
              label: String(new Date().getFullYear() - 10 + i),
            }))}
          />
          <Select
            aria-label={t("reportCurrency")}
            value={currency}
            onChange={setCurrency}
            options={currencies}
            showSearch
            optionFilterProp="label"
            style={{ width: 120 }}
          />
          {kind === "categories" && (
            <Select
              aria-label={t("period")}
              value={month}
              onChange={setMonth}
              style={{ width: 150 }}
              options={[
                { value: 0, label: t("wholeYear") },
                ...Array.from({ length: 12 }, (_, i) => ({
                  value: i + 1,
                  label: monthLabel(
                    `${year}-${String(i + 1).padStart(2, "0")}`,
                  ),
                })),
              ]}
            />
          )}
          {kind === "forecast" && (
            <Select
              aria-label={t("scenario")}
              value={scenario}
              onChange={setScenario}
              style={{ width: 230, maxWidth: "100%" }}
              options={[
                { value: "", label: t("baseline") },
                ...scenarios.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}
        </Space>
        <Typography.Text type="secondary">
          {t("currencyReportHelp")}
        </Typography.Text>
      </Flex>
      {report.isPending ? (
        <Loading />
      ) : report.error ? (
        <ErrorNotice error={report.error} />
      ) : (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Row gutter={[16, 16]}>
            {(
              [
                ["income", totals?.income, ArrowDownOutlined],
                ["expenses", totals?.expenses, ArrowUpOutlined],
                ["netSavings", totals?.netSavings, WalletOutlined],
                ["variance", totals?.variance, LineChartOutlined],
              ] as const
            ).map(([key, value, Icon]) => (
              <Col xs={24} sm={12} xl={6} key={key}>
                <Card style={{ height: "100%" }}>
                  <Flex justify="space-between" align="start" gap="small">
                    <Statistic
                      title={t(key)}
                      value={0}
                      formatter={() => money(value)}
                    />
                    <Avatar
                      shape="square"
                      icon={<Icon />}
                      style={{
                        background: token.colorBgBase,
                        color: token.colorBgContainer,
                      }}
                    />
                  </Flex>
                  <Typography.Text type="secondary">
                    {key === "netSavings"
                      ? `${t("savingsRate")}: ${totals?.savingsRate ? new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 2 }).format(Number(totals.savingsRate) / 10000) : t("notApplicable")}`
                      : `${year} · ${currency}`}
                  </Typography.Text>
                </Card>
              </Col>
            ))}
          </Row>
          {kind === "forecast" && (
            <Alert
              type="info"
              showIcon
              message={t("whatIfExplanation")}
              description={t("forecastExplanation")}
            />
          )}
          <Row gutter={[24, 24]}>
            <Col xs={24} xl={kind === "categories" ? 24 : 16}>
              <Card
                title={t(
                  kind === "categories"
                    ? "categorySpending"
                    : "incomeVsExpenses",
                )}
                extra={<Tag bordered={false}>{year}</Tag>}
              >
                <ReportChart
                  rows={chart}
                  kind={kind === "categories" ? "categories" : "cashflow"}
                  format={tooltip}
                />
              </Card>
            </Col>
            {kind !== "categories" && (
              <Col xs={24} xl={8}>
                <Card
                  title={t("budgetHealth")}
                  style={{ height: "100%" }}
                  extra={<WalletOutlined />}
                >
                  <Space
                    direction="vertical"
                    size="large"
                    style={{ width: "100%" }}
                  >
                    <Statistic
                      title={t("remainingBudget")}
                      value={0}
                      formatter={() => money(totals?.variance)}
                    />
                    <Progress
                      percent={Math.min(100, Math.max(0, budgetPercent))}
                      status={budgetPercent > 100 ? "exception" : "normal"}
                      showInfo={false}
                    />
                    <Flex justify="space-between" gap="small" wrap>
                      <Typography.Text type="secondary">
                        {t("budget")}
                      </Typography.Text>
                      <Typography.Text strong>
                        {money(totals?.budget)}
                      </Typography.Text>
                    </Flex>
                    <Typography.Paragraph type="secondary">
                      {t("budgetProgressHelp")}
                    </Typography.Paragraph>
                    <Button href="/budgets" block>
                      {t("manageBudgets")} <ArrowRightOutlined aria-hidden />
                    </Button>
                  </Space>
                </Card>
              </Col>
            )}
          </Row>
          {kind !== "categories" && (
            <Card title={t("savingsVsVariance")}>
              <ReportChart rows={chart} kind="savings" format={tooltip} />
            </Card>
          )}
          {kind === "dashboard" ? (
            <Card
              title={t("recentTransactions")}
              extra={
                <Button type="link" href="/transactions">
                  {t("viewAll")} <ArrowRightOutlined aria-hidden />
                </Button>
              }
              styles={{ body: { padding: 0 } }}
            >
              <TransactionTable
                rows={report.data.recentTransactions}
                onEdit={(transaction) =>
                  setDraft({ resource: "transactions", entity: transaction })
                }
              />
            </Card>
          ) : (
            <Card
              title={t(
                kind === "categories"
                  ? "categoryBreakdown"
                  : "monthlyBreakdown",
              )}
              styles={{ body: { padding: 0 } }}
            >
              <Table
                rowKey="key"
                pagination={false}
                scroll={{ x: 800 }}
                columns={columns}
                dataSource={
                  kind === "categories"
                    ? rows
                    : [...rows, ...(totals ? [totals] : [])]
                }
              />
            </Card>
          )}
        </Space>
      )}
      <EntryDrawer draft={draft} onClose={() => setDraft(undefined)} />
    </>
  );
}
