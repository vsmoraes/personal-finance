import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  LineChartOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
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
import { CategoryIcon } from "../shared/category-icons.tsx";
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
  Tag,
  theme,
  Typography,
} from "../shared/design-system.tsx";
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
        <div className="finance-overview">
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
                <div className="finance-balance-header">
                  <div>
                    <span className="finance-muted">{t("netSavings")}</span>
                    <span className="finance-balance-period">{year}</span>
                  </div>
                  <div className="finance-balance-summary">
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
                  </div>
                </div>
                <div className="finance-chart" aria-label={t("netSavings")}>
                  <OverviewTrendChart rows={report.data.rows} />
                </div>
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
                  rows={report.data.recentTransactions.slice(0, 4)}
                  loading={false}
                  showControls={false}
                  onView={setViewing}
                />
              </Card>
              <div className="finance-overview-stats">
                <Card className="finance-panel finance-stat finance-budget">
                  <span className="finance-muted">{t("budget")}</span>
                  <strong>{money(totals?.budget)}</strong>
                  <span className="finance-muted">
                    {Math.round(budgetPercent)}% {t("budget").toLowerCase()}
                  </span>
                </Card>
                <Card className="finance-panel finance-stat finance-invest">
                  <span className="finance-muted">{t("income")}</span>
                  <strong>{money(totals?.income)}</strong>
                  <span className="finance-muted">{year}</span>
                </Card>
                <Card className="finance-panel finance-stat finance-spending">
                  <span className="finance-muted">{t("expenses")}</span>
                  <strong>{money(totals?.expenses)}</strong>
                  <span className="finance-muted">{year}</span>
                </Card>
              </div>
            </section>
          )}
        </div>
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
          {kind !== "categories" && (
            <Row gutter={[24, 24]}>
              <Col xs={24} xl={16}>
                <Card
                  id="report-cashflow-chart"
                  className="insight-card"
                  title={t("incomeVsExpenses")}
                  extra={<Tag bordered={false}>{year}</Tag>}
                >
                  <ReportChart rows={chart} kind="cashflow" format={tooltip} />
                </Card>
              </Col>
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
            </Row>
          )}
          {kind !== "categories" && (
            <Card
              id="report-savings-chart"
              className="insight-card"
              title={t("savingsVsVariance")}
            >
              <ReportChart rows={chart} kind="savings" format={tooltip} />
            </Card>
          )}
          {kind === "categories" ? (
            <Card
              className="finance-report-list-card"
              title={t("categoryBreakdown")}
            >
              <div className="finance-category-list">
                {[...rows]
                  .sort((a, b) =>
                    a.expenses === b.expenses
                      ? 0
                      : a.expenses > b.expenses
                        ? -1
                        : 1,
                  )
                  .map((row) => {
                    const category = categories.find(
                      (item) => item.id === row.key,
                    );
                    const budgetShare =
                      row.budget && row.budget > 0n
                        ? Math.min(
                            100,
                            Number((row.expenses * 100n) / row.budget),
                          )
                        : 0;
                    return (
                      <div className="finance-category-list-row" key={row.key}>
                        <span className="finance-category-list-icon">
                          <CategoryIcon name={category?.icon ?? ""} />
                        </span>
                        <div className="finance-category-list-main">
                          <strong>{label(row)}</strong>
                          {row.budget && row.budget > 0n ? (
                            <Progress
                              percent={budgetShare}
                              showInfo={false}
                              size="small"
                              status={
                                row.expenses > row.budget
                                  ? "exception"
                                  : "normal"
                              }
                            />
                          ) : null}
                          <small>
                            {t("budget")}: {money(row.budget)} · {t("variance")}
                            : {money(row.variance)}
                          </small>
                        </div>
                        <strong className="finance-category-list-amount">
                          {money(row.expenses)}
                        </strong>
                      </div>
                    );
                  })}
              </div>
            </Card>
          ) : (
            <Card
              className="finance-report-list-card"
              title={t("monthlyBreakdown")}
            >
              <div className="finance-monthly-grid">
                {rows.map((row) => (
                  <div className="finance-monthly-card" key={row.key}>
                    <div className="finance-monthly-card-head">
                      <div className="finance-monthly-card-kicker">
                        <span>{label(row)}</span>
                        {kind === "forecast" && (
                          <span
                            className={`finance-monthly-status ${row.actual ? "finance-monthly-status--actual" : "finance-monthly-status--forecast"}`}
                          >
                            {t(row.actual ? "actual" : "forecast")}
                          </span>
                        )}
                      </div>
                      <strong>{money(row.netSavings)}</strong>
                      <small>{t("netSavings")}</small>
                    </div>
                    <dl>
                      <div>
                        <dt>{t("income")}</dt>
                        <dd>{money(row.income)}</dd>
                      </div>
                      <div>
                        <dt>{t("expenses")}</dt>
                        <dd>{money(row.expenses)}</dd>
                      </div>
                      <div>
                        <dt>{t("budget")}</dt>
                        <dd>{money(row.budget)}</dd>
                      </div>
                      <div>
                        <dt>{t("variance")}</dt>
                        <dd>{money(row.variance)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
                {totals && (
                  <div className="finance-monthly-total">
                    <div>
                      <span>{t("totalYear")}</span>
                      <strong>{money(totals.netSavings)}</strong>
                      <small>{t("netSavings")}</small>
                    </div>
                    <dl>
                      <div>
                        <dt>{t("income")}</dt>
                        <dd>{money(totals.income)}</dd>
                      </div>
                      <div>
                        <dt>{t("expenses")}</dt>
                        <dd>{money(totals.expenses)}</dd>
                      </div>
                      <div>
                        <dt>{t("budget")}</dt>
                        <dd>{money(totals.budget)}</dd>
                      </div>
                      <div>
                        <dt>{t("variance")}</dt>
                        <dd>{money(totals.variance)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            </Card>
          )}
        </Space>
      )}
      <TransactionDetailsDrawer
        transaction={viewing}
        onClose={() => setViewing(undefined)}
      />
    </>
  );
}
