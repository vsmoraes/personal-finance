import { SearchOutlined } from "@ant-design/icons";
import { Empty, Input, Pagination, Select, Spin } from "antd";
import { useTranslation } from "react-i18next";

import {
  type Transaction,
  TransactionType,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import { categoryName, useResources, useSettings } from "../shared/api.ts";
import { CategoryIcon } from "../shared/category-icons.tsx";
import { formatDate } from "../shared/dates.ts";

export function TransactionFeed({
  rows,
  loading,
  filters,
  onChange,
  onView,
  showControls = true,
  pagination,
}: {
  rows: Transaction[];
  loading: boolean;
  filters?: Record<string, string>;
  onChange?: (next: Record<string, string>) => void;
  onView: (transaction: Transaction) => void;
  showControls?: boolean;
  pagination?: {
    current: number;
    total: number;
    onChange: (page: number) => void;
  };
}) {
  const { t, i18n } = useTranslation();
  const categories = useResources("categories").data?.categories ?? [];
  const settings = useSettings().data;
  const activeFilters = filters ?? {};
  const update = (next: Record<string, string>) =>
    onChange?.({ ...activeFilters, ...next });
  return (
    <>
      {showControls && (
        <div className="finance-tools">
          <Input
            id="transaction-filter-search"
            value={activeFilters["search"] ?? ""}
            onChange={(event) => update({ search: event.target.value })}
            prefix={<SearchOutlined />}
            placeholder={t("searchTransactions")}
            allowClear
          />
          <div id="transaction-filter-type">
            <Select
              value={activeFilters["type"] ?? ""}
              onChange={(type) => update({ type })}
              options={[
                { value: "", label: t("allTypes") },
                { value: "TRANSACTION_TYPE_INCOME", label: t("income") },
                { value: "TRANSACTION_TYPE_EXPENSE", label: t("expenses") },
              ]}
            />
          </div>
          <div id="transaction-filter-category">
            <Select
              value={activeFilters["categoryId"] ?? ""}
              onChange={(categoryId) => update({ categoryId })}
              options={[
                { value: "", label: t("allCategories") },
                ...categories
                  .filter((category) => !category.archived)
                  .map((category) => ({
                    value: category.id,
                    label: categoryName(category, t),
                  })),
              ]}
            />
          </div>
          <div id="transaction-filter-sort">
            <Select
              value={`${activeFilters["sort"] ?? "date"}:${activeFilters["descending"] ?? "true"}`}
              onChange={(value) => {
                const [sort = "date", descending = "true"] = value.split(":");
                update({ sort, descending });
              }}
              options={[
                { value: "date:true", label: `${t("date")} ↓` },
                { value: "date:false", label: `${t("date")} ↑` },
                { value: "amount:true", label: `${t("amount")} ↓` },
                { value: "amount:false", label: `${t("amount")} ↑` },
                { value: "counterparty:false", label: `${t("merchant")} A–Z` },
              ]}
            />
          </div>
        </div>
      )}
      {loading ? (
        <div className="finance-feed-loading">
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <Empty description={t("empty")} />
      ) : (
        <div className="finance-feed">
          {rows.map((row) => {
            const category = categories.find(
              (item) => item.id === row.categoryId,
            );
            const income = row.type === TransactionType.INCOME;
            return (
              <button
                id={`transaction-row-${row.id}`}
                className="finance-transaction"
                type="button"
                key={row.id}
                onClick={() => onView(row)}
              >
                <span className="finance-transaction-icon">
                  <CategoryIcon name={category?.icon ?? ""} />
                </span>
                <span className="finance-transaction-main">
                  <b>{row.counterparty || categoryName(category, t)}</b>
                  <small>{row.note || t(income ? "income" : "expenses")}</small>
                </span>
                <span className="finance-transaction-category">
                  {categoryName(category, t)}
                </span>
                <span className="finance-transaction-date">
                  {formatDate(
                    row.date,
                    i18n.language,
                    settings?.dateFormat ?? "yyyy-MM-dd",
                  )}
                </span>
                <span className={income ? "finance-income" : "finance-expense"}>
                  {income ? "+ " : "− "}
                  {formatMoney(
                    row.amount?.minorUnits ?? 0n,
                    row.amount?.currencyCode ?? "EUR",
                    i18n.language,
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {pagination && (
        <div id="transaction-pagination">
          <Pagination
            className="finance-feed-pagination"
            current={pagination.current}
            total={pagination.total}
            pageSize={20}
            showSizeChanger={false}
            onChange={pagination.onChange}
            itemRender={(page, type, original) =>
              type === "page" ? (
                <span id={`transaction-page-${page}`}>{original}</span>
              ) : (
                original
              )
            }
          />
        </div>
      )}
    </>
  );
}
