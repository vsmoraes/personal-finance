import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import {
  Button,
  Descriptions,
  Drawer,
  Grid,
  Space,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type Transaction,
  TransactionType,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import { categoryName, useResources, useSettings } from "../shared/api.ts";
import { formatDate } from "../shared/dates.ts";
import { TransactionForm } from "./transaction-form.tsx";

export function TransactionDetailsDrawer({
  transaction,
  onClose,
  onDelete,
}: {
  transaction: Transaction | undefined;
  onClose: () => void;
  onDelete?: (transaction: Transaction) => void;
}) {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const settings = useSettings().data;
  const categories = useResources("categories").data?.categories ?? [];
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  return (
    <Drawer
      open={Boolean(transaction)}
      onClose={close}
      width={screens.sm ? 520 : "100%"}
      destroyOnHidden
      title={t(editing ? "editTransaction" : "transactionDetails")}
      extra={
        transaction &&
        (editing ? (
          <Button onClick={() => setEditing(false)}>{t("cancel")}</Button>
        ) : (
          <Space>
            {onDelete && (
              <Button
                danger
                icon={<DeleteOutlined aria-hidden />}
                onClick={() => onDelete(transaction)}
              >
                {t("delete")}
              </Button>
            )}
            <Button
              type="primary"
              icon={<EditOutlined aria-hidden />}
              onClick={() => setEditing(true)}
            >
              {t("edit")}
            </Button>
          </Space>
        ))
      }
    >
      {transaction &&
        (editing ? (
          <TransactionForm transaction={transaction} onSaved={close} />
        ) : (
          <Descriptions
            column={1}
            size="small"
            labelStyle={{ width: 120 }}
            items={[
              {
                key: "date",
                label: t("date"),
                children: formatDate(
                  transaction.date,
                  i18n.language,
                  settings?.dateFormat ?? "yyyy-MM-dd",
                ),
              },
              {
                key: "merchant",
                label: t("merchant"),
                children: transaction.counterparty || t("unknown"),
              },
              {
                key: "category",
                label: t("category"),
                children: categoryName(
                  categories.find(
                    (category) => category.id === transaction.categoryId,
                  ),
                  t,
                ),
              },
              {
                key: "type",
                label: t("type"),
                children: (
                  <Tag
                    bordered={false}
                    color={
                      transaction.type === TransactionType.INCOME
                        ? "success"
                        : "default"
                    }
                  >
                    {t(
                      transaction.type === TransactionType.INCOME
                        ? "income"
                        : "expenses",
                    )}
                  </Tag>
                ),
              },
              {
                key: "amount",
                label: t("amount"),
                children: (
                  <Typography.Text strong>
                    {formatMoney(
                      transaction.amount?.minorUnits ?? 0n,
                      transaction.amount?.currencyCode ?? "EUR",
                      i18n.language,
                    )}
                  </Typography.Text>
                ),
              },
              ...(transaction.note
                ? [
                    {
                      key: "note",
                      label: t("note"),
                      children: transaction.note,
                    },
                  ]
                : []),
            ]}
          />
        ))}
    </Drawer>
  );
}
