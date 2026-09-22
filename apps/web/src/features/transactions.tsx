import { DownloadOutlined } from "@ant-design/icons";
import { create, toJson } from "@bufbuild/protobuf";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Dropdown,
  Flex,
  Modal,
  Select,
  Space,
  Typography,
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BulkRequestSchema,
  FinanceResponseSchema,
  type Transaction,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import {
  categoryName,
  getMessage,
  request,
  useRefresh,
  useResources,
} from "../shared/api.ts";
import { ErrorNotice, PageTitle } from "../shared/ui.tsx";
import { TransactionDetailsDrawer } from "./transaction-details-drawer.tsx";
import { TransactionTable } from "./transaction-table.tsx";
export function Transactions() {
  const { t } = useTranslation();
  const refresh = useRefresh("transactions");
  const [filters, setFilters] = useState<Record<string, string>>({
    sort: "date",
    descending: "true",
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewing, setViewing] = useState<Transaction>();
  const [deleting, setDeleting] = useState<Transaction>();
  const [bulkCategory, setBulkCategory] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const categories = useResources("categories").data?.categories ?? [];
  const params = new URLSearchParams({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    page: String(page),
    pageSize: "20",
  });
  const query = useQuery({
    queryKey: ["transactions", params.toString()],
    queryFn: () => getMessage(`transactions?${params}`, FinanceResponseSchema),
  });
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      refresh();
      setSelected([]);
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
      <PageTitle
        title={t("transactions")}
        subtitle={t("transactionsDescription")}
        actions={
          <Space wrap>
            <Dropdown
              menu={{
                items: [
                  {
                    key: "csv",
                    label: (
                      <Typography.Link href="/api/v1/export?format=csv">
                        {t("exportCsv")}
                      </Typography.Link>
                    ),
                  },
                  {
                    key: "json",
                    label: (
                      <Typography.Link href="/api/v1/export?format=json">
                        {t("exportJson")}
                      </Typography.Link>
                    ),
                  },
                ],
              }}
            >
              <Button icon={<DownloadOutlined aria-hidden />}>
                {t("export")}
              </Button>
            </Dropdown>
          </Space>
        }
      />
      <Card styles={{ body: { padding: 0 } }}>
        <Flex vertical gap="middle" style={{ padding: "8px 20px 16px" }}>
          {selected.length > 0 && (
            <Flex gap="small" wrap align="center">
              <Typography.Text strong>
                {t("selectedCount", { count: selected.length })}
              </Typography.Text>
              <Select
                aria-label={t("category")}
                showSearch
                optionFilterProp="label"
                value={bulkCategory}
                onChange={setBulkCategory}
                style={{ width: 190 }}
                options={categories
                  .filter((c) => !c.archived)
                  .map((c) => ({ value: c.id, label: categoryName(c, t) }))}
              />
              <Button
                loading={busy}
                disabled={!bulkCategory}
                onClick={() => {
                  void mutate(() =>
                    request(
                      "transactions/bulk",
                      "POST",
                      toJson(
                        BulkRequestSchema,
                        create(BulkRequestSchema, {
                          transactionIds: selected,
                          categoryId: bulkCategory,
                        }),
                      ),
                    ),
                  );
                }}
              >
                {t("recategorize")}
              </Button>
              <Button
                loading={busy}
                onClick={() => {
                  void mutate(() =>
                    request(
                      "categorization-rules/preview",
                      "POST",
                      toJson(
                        BulkRequestSchema,
                        create(BulkRequestSchema, {
                          transactionIds: selected,
                          apply: true,
                        }),
                      ),
                    ),
                  );
                }}
              >
                {t("reapplyRules")}
              </Button>
            </Flex>
          )}
          {error || query.error ? (
            <ErrorNotice error={error ?? query.error} />
          ) : null}
        </Flex>
        <TransactionTable
          rows={query.data?.transactions ?? []}
          loading={query.isPending}
          onView={setViewing}
          selected={selected}
          onSelectionChange={setSelected}
          onPageChange={setPage}
          filters={filters}
          onChange={(next) => {
            setFilters({ sort: "date", descending: "true", ...next });
            setPage(1);
            setSelected([]);
          }}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.pagination?.total ?? 0,
            showSizeChanger: false,
            responsive: true,
            showTotal: (total) => t("transactionCount", { count: total }),
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
        okButtonProps={{ danger: true, loading: busy }}
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
