import { DownloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Dropdown, Modal, Space, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  FinanceResponseSchema,
  type Transaction,
  TransactionType,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import { getMessage, request, useRefresh } from "../shared/api.ts";
import { ErrorNotice } from "../shared/ui.tsx";
import { TransactionDetailsDrawer } from "./transaction-details-drawer.tsx";
import { TransactionFeed } from "./transaction-feed.tsx";
export function Transactions() {
  const { t, i18n } = useTranslation();
  const refresh = useRefresh("transactions");
  const [filters, setFilters] = useState<Record<string, string>>({
    sort: "date",
    descending: "true",
  });
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Transaction>();
  const [deleting, setDeleting] = useState<Transaction>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    page: String(page),
    pageSize: "20",
  });
  const query = useQuery({
    queryKey: ["transactions", params.toString()],
    queryFn: () => getMessage(`transactions?${params}`, FinanceResponseSchema),
  });
  const totals = (query.data?.transactions ?? []).reduce(
    (result, transaction) => {
      const amount = transaction.amount?.minorUnits ?? 0n;
      if (transaction.type === TransactionType.INCOME) result.income += amount;
      else result.expenses += amount;
      return result;
    },
    { income: 0n, expenses: 0n },
  );
  const currency = query.data?.transactions[0]?.amount?.currencyCode ?? "EUR";
  const money = (value: bigint) => formatMoney(value, currency, i18n.language);
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      refresh();
      setDeleting(undefined);
      setViewing(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="finance-hero">
        <div>
          <div className="finance-eyebrow">
            {new Intl.DateTimeFormat(undefined, {
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </div>
          <h1>{t("transactions")}</h1>
        </div>
        <div>
          <Space wrap>
            <Button
              id="transaction-create-button"
              type="primary"
              className="finance-new-transaction"
              onClick={() =>
                window.dispatchEvent(new Event("finance:create-transaction"))
              }
            >
              + {t("addTransaction")}
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: "csv",
                    label: (
                      <Typography.Link
                        id="transaction-export-csv"
                        href="/api/v1/export?format=csv"
                      >
                        {t("exportCsv")}
                      </Typography.Link>
                    ),
                  },
                  {
                    key: "json",
                    label: (
                      <Typography.Link
                        id="transaction-export-json"
                        href="/api/v1/export?format=json"
                      >
                        {t("exportJson")}
                      </Typography.Link>
                    ),
                  },
                ],
              }}
            >
              <Button
                id="transaction-export-button"
                icon={<DownloadOutlined aria-hidden />}
              >
                {t("export")}
              </Button>
            </Dropdown>
          </Space>
        </div>
      </section>
      <section className="transactions-summary">
        <Card className="finance-mini">
          <span className="finance-muted">{t("income")}</span>
          <strong className="finance-positive">{money(totals.income)}</strong>
        </Card>
        <Card className="finance-mini">
          <span className="finance-muted">{t("expenses")}</span>
          <strong className="finance-expense">{money(totals.expenses)}</strong>
        </Card>
        <Card className="finance-mini">
          <span className="finance-muted">{t("netSavings")}</span>
          <strong className="finance-positive">
            {money(totals.income - totals.expenses)}
          </strong>
        </Card>
      </section>
      <Card className="finance-panel finance-transactions-panel">
        {error || query.error ? (
          <ErrorNotice error={error ?? query.error} />
        ) : null}
        <TransactionFeed
          rows={query.data?.transactions ?? []}
          loading={query.isPending}
          onView={setViewing}
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          pagination={{
            current: page,
            total: query.data?.pagination?.total ?? 0,
            onChange: setPage,
          }}
        />
      </Card>
      <TransactionDetailsDrawer
        transaction={viewing}
        onClose={() => setViewing(undefined)}
        onDelete={setDeleting}
      />
      <Modal
        title={t("deleteTransaction")}
        open={Boolean(deleting)}
        onCancel={() => setDeleting(undefined)}
        okText={t("delete")}
        cancelText={t("cancel")}
        okButtonProps={{
          id: "transaction-delete-confirm",
          danger: true,
          loading: busy,
        }}
        onOk={() => {
          if (deleting)
            void mutate(() =>
              request(`transactions/${deleting.id}`, "DELETE", undefined, {
                "if-match": String(deleting.version),
              }),
            );
        }}
      >
        <Typography.Paragraph>{t("deleteConfirmation")}</Typography.Paragraph>
      </Modal>
    </>
  );
}
