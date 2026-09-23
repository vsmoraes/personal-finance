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
  type Transaction,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import {
  categoryName,
  getMessage,
  useResources,
  useSettings,
} from "../shared/api.ts";
import { ErrorNotice, Loading, PageTitle } from "../shared/ui.tsx";
import { OverviewTrendChart } from "./overview-trend-chart.tsx";
import { ReportChart } from "./report-chart.tsx";
import { TransactionDetailsDrawer } from "./transaction-details-drawer.tsx";
import { TransactionFeed } from "./transaction-feed.tsx";
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
  const currency = settings?.defaultCurrency ?? "EUR";
  const [month, setMonth] = useState(0);
  const [scenario, setScenario] = useState(
    () => new URLSearchParams(window.location.search).get("scenarioId") ?? "",
  );
  const [viewing, setViewing] = useState<Transaction>();
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
  if (kind === "dashboard")
    return (
      <>
        <section className="finance-hero">
          <div>
            <div className="finance-eyebrow">
              {new Intl.DateTimeFormat(i18n.language, {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date())}
            </div>
            <h1>{t("dashboard")}</h1>
          </div>
          <p>{t("dashboardDescription")}</p>
        </section>
        {report.isPending ? (
          <Loading />
        ) : report.error ? (
          <ErrorNotice error={report.error} />
        ) : (
          <section className="dashboard-grid">
            <Card className="finance-panel finance-balance">
              <span className="finance-muted">{t("netSavings")}</span>
              <div className="finance-balance-value">
                {money(totals?.netSavings)}
              </div>
              <span className="finance-positive finance-growth">
                <ArrowUpOutlined />{" "}
                {totals?.savingsRate
                  ? new Intl.NumberFormat(i18n.language, {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(Number(totals.savingsRate) / 10000)
                  : "—"}{" "}
                {t("savingsRate").toLowerCase()}
              </span>
              <div className="finance-chart" aria-label={t("netSavings")}>
                <OverviewTrendChart rows={report.data.rows} />
              </div>
            </Card>
            <Card className="finance-panel finance-stat finance-budget">
              <span className="finance-muted">{t("budget")}</span>
              <strong>{money(totals?.budget)}</strong>
              <span className="finance-muted">{t("expenses")}</span>
              <span className="finance-pill">
                {Math.round(budgetPercent)}% {t("budget").toLowerCase()}
              </span>
            </Card>
            <Card className="finance-panel finance-stat finance-invest">
              <span className="finance-muted">{t("income")}</span>
              <strong>{money(totals?.income)}</strong>
              <span className="finance-muted">{year}</span>
              <span className="finance-pill">{t("savingsRate")}</span>
            </Card>
            <Card
              className="finance-panel finance-recent"
              title={t("recentTransactions")}
              extra={
                <Button
                  id="dashboard-view-all-transactions"
                  type="link"
                  href="/transactions"
                >
                  {t("viewAll")} <ArrowRightOutlined />
                </Button>
              }
            >
              <TransactionFeed
                rows={report.data.recentTransactions.slice(0, 2)}
                loading={false}
                showControls={false}
                onView={setViewing}
              />
            </Card>
          </section>
        )}
        <TransactionDetailsDrawer
          transaction={viewing}
          onClose={() => setViewing(undefined)}
        />
      </>
    );
  return (
    <>
      <PageTitle
        title={t(kind === "categories" ? "categoryReport" : kind)}
        subtitle={t(`${kind}Description`)}
        actions={null}
      />
      <Flex
        className="report-filters"
        align="center"
        justify="space-between"
        gap="middle"
        wrap
        style={{ marginBottom: 24 }}
      >
        <Space wrap>
          <div id={`report-${kind}-year`}>
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
          </div>
          {kind === "categories" && (
            <div id="report-categories-month">
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
            </div>
          )}
          {kind === "forecast" && (
            <div id="report-forecast-scenario">
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
            </div>
          )}
        </Space>
        <Typography.Text type="secondary">{currency}</Typography.Text>
      </Flex>
      {report.isPending ? (
        <Loading />
      ) : report.error ? (
        <ErrorNotice error={report.error} />
      ) : (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Row className="metric-grid" gutter={[16, 16]}>
            {(
              [
                ["income", totals?.income, ArrowDownOutlined],
                ["expenses", totals?.expenses, ArrowUpOutlined],
                ["netSavings", totals?.netSavings, WalletOutlined],
                ["variance", totals?.variance, LineChartOutlined],
              ] as const
            ).map(([key, value, Icon]) => (
              <Col xs={12} sm={12} xl={6} key={key}>
                <Card
                  className={`metric-card metric-card-${key}`}
                  size="small"
                  style={{ height: "100%" }}
                >
                  <Flex justify="space-between" align="start" gap="small">
                    <Statistic
                      title={t(key)}
                      value={0}
                      formatter={() => money(value)}
                    />
                    <Avatar
                      className="metric-icon"
                      shape="square"
                      icon={<Icon />}
                      style={{
                        background: token.colorPrimaryBg,
                        color: token.colorPrimary,
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
                className="insight-card"
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
                  className="budget-health-card"
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
                    <Button id="report-view-budgets" href="/budgets" block>
                      {t("manageBudgets")} <ArrowRightOutlined aria-hidden />
                    </Button>
                  </Space>
                </Card>
              </Col>
            )}
          </Row>
          {kind !== "categories" && (
            <Card className="insight-card" title={t("savingsVsVariance")}>
              <ReportChart rows={chart} kind="savings" format={tooltip} />
            </Card>
          )}
          <Card
            title={t(
              kind === "categories" ? "categoryBreakdown" : "monthlyBreakdown",
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
        </Space>
      )}
      <TransactionDetailsDrawer
        transaction={viewing}
        onClose={() => setViewing(undefined)}
      />
    </>
  );
}
