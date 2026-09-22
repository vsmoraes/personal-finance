import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import {
  Button,
  Flex,
  Grid,
  Input,
  Space,
  Table,
  type TableProps,
  Tag,
  Typography,
} from "antd";
import { useTranslation } from "react-i18next";

import {
  type Transaction,
  TransactionType,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import { categoryName, useResources, useSettings } from "../shared/api.ts";
import { CategoryIcon } from "../shared/category-icons.tsx";
import { formatDate } from "../shared/dates.ts";
import { EmptyState } from "../shared/ui.tsx";

export function TransactionTable({
  rows,
  loading = false,
  onEdit,
  onDelete,
  selected,
  onSelectionChange,
  pagination = false,
  filters,
  onChange,
}: {
  rows: Transaction[];
  loading?: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  pagination?: TableProps<Transaction>["pagination"];
  filters?: Record<string, string>;
  onChange?: (filters: Record<string, string>) => void;
}) {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const categories = useResources("categories").data?.categories ?? [];
  const settings = useSettings().data;
  const columns: TableProps<Transaction>["columns"] = [
    {
      title: t("date"),
      key: "date",
      responsive: ["md"],
      width: 125,
      sorter: true,
      render: (_, row) => (
        <Typography.Text type="secondary">
          {formatDate(
            row.date,
            i18n.language,
            settings?.dateFormat ?? "yyyy-MM-dd",
          )}
        </Typography.Text>
      ),
    },
    {
      title: t("merchant"),
      key: "counterparty",
      width: screens.md ? 260 : 180,
      sorter: true,
      filterDropdown: ({
        setSelectedKeys,
        selectedKeys,
        confirm,
        clearFilters,
      }) => (
        <Flex vertical gap="small" style={{ padding: 8 }}>
          <Input
            placeholder={t("searchTransactions")}
            value={selectedKeys[0]}
            onChange={(event) =>
              setSelectedKeys(event.target.value ? [event.target.value] : [])
            }
            onPressEnter={() => confirm()}
          />
          <Space>
            <Button type="primary" size="small" onClick={() => confirm()}>
              {t("search")}
            </Button>
            <Button
              size="small"
              onClick={() => {
                clearFilters?.();
                confirm();
              }}
            >
              {t("reset")}
            </Button>
          </Space>
        </Flex>
      ),
      filteredValue: filters?.["search"] ? [filters["search"]] : null,
      render: (_, row) => (
        <Flex vertical gap={2}>
          <Typography.Text strong ellipsis>
            {row.counterparty ||
              categoryName(
                categories.find((c) => c.id === row.categoryId),
                t,
              )}
          </Typography.Text>
          {row.note && (
            <Typography.Text type="secondary" ellipsis={{ tooltip: row.note }}>
              {row.note}
            </Typography.Text>
          )}
        </Flex>
      ),
    },
    {
      title: t("category"),
      key: "category",
      responsive: ["md"],
      width: 180,
      filters: categories.map((category) => ({
        text: categoryName(category, t),
        value: category.id,
      })),
      filteredValue: filters?.["categoryId"] ? [filters["categoryId"]] : null,
      render: (_, row) => {
        const category = categories.find((c) => c.id === row.categoryId);
        return (
          <Space>
            <CategoryIcon name={category?.icon ?? ""} />
            <Typography.Text>{categoryName(category, t)}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: t("type"),
      key: "type",
      responsive: ["md"],
      width: 110,
      filters: [
        { text: t("expenses"), value: "TRANSACTION_TYPE_EXPENSE" },
        { text: t("income"), value: "TRANSACTION_TYPE_INCOME" },
      ],
      filteredValue: filters?.["type"] ? [filters["type"]] : null,
      render: (_, row) => (
        <Tag
          bordered={false}
          color={row.type === TransactionType.INCOME ? "success" : "default"}
        >
          {t(row.type === TransactionType.INCOME ? "income" : "expenses")}
        </Tag>
      ),
    },
    {
      title: t("amount"),
      key: "amount",
      width: screens.md ? 160 : 120,
      align: "right",
      sorter: true,
      render: (_, row) => (
        <Typography.Text
          strong
          {...(row.type === TransactionType.INCOME
            ? { type: "success" as const }
            : {})}
        >
          {formatMoney(
            row.amount?.minorUnits ?? 0n,
            row.amount?.currencyCode ?? "EUR",
            i18n.language,
          )}
        </Typography.Text>
      ),
    },
    {
      title: t("actions"),
      key: "actions",
      width: onDelete ? (screens.md ? 150 : 96) : 64,
      ...(screens.md ? { fixed: "right" as const } : {}),
      render: (_, row) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined aria-hidden />}
            aria-label={t("edit")}
            onClick={() => onEdit(row)}
          >
            {screens.md ? t("edit") : null}
          </Button>
          {onDelete && (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined aria-hidden />}
              aria-label={t("delete")}
              onClick={() => onDelete(row)}
            >
              {screens.md ? t("delete") : null}
            </Button>
          )}
        </Space>
      ),
    },
  ];
  return (
    <Table<Transaction>
      rowKey="id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      pagination={pagination}
      onChange={(_, tableFilters, sorter) => {
        const next: Record<string, string> = {};
        const search = tableFilters["counterparty"]?.[0];
        const categoryId = tableFilters["category"]?.[0];
        const type = tableFilters["type"]?.[0];
        if (search) next["search"] = String(search);
        if (categoryId) next["categoryId"] = String(categoryId);
        if (type) next["type"] = String(type);
        const currentSorter = Array.isArray(sorter) ? sorter[0] : sorter;
        if (currentSorter?.columnKey)
          next["sort"] = String(currentSorter.columnKey);
        if (currentSorter?.order)
          next["descending"] = String(currentSorter.order === "descend");
        onChange?.(next);
      }}
      scroll={{ x: screens.md ? 985 : 430 }}
      locale={{ emptyText: <EmptyState /> }}
      {...(onSelectionChange
        ? {
            rowSelection: {
              selectedRowKeys: selected ?? [],
              onChange: (keys) => onSelectionChange(keys.map(String)),
              getCheckboxProps: () => ({
                name: "transaction-selection",
                "aria-label": t("selectTransaction"),
              }),
            },
          }
        : {})}
    />
  );
}
