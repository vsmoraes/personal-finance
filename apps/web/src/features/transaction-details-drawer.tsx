import { CloseOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type Transaction,
  TransactionType,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { formatMoney } from "../../../../packages/domain/src/money.ts";
import { categoryName, useResources, useSettings } from "../shared/api.ts";
import { CategoryIcon } from "../shared/category-icons.tsx";
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
  const settings = useSettings().data;
  const categories = useResources("categories").data?.categories ?? [];
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  return (
    <Modal
      open={Boolean(transaction)}
      onCancel={close}
      centered
      width={520}
      destroyOnHidden
      closable={false}
      footer={null}
      className="finance-frosted-modal finance-transaction-modal"
      title={
        <div className="finance-drawer-head">
          <span className="finance-eyebrow">
            {t(editing ? "editTransaction" : "transactionDetails")}
          </span>
          <Button
            id="transaction-details-close"
            type="text"
            shape="circle"
            icon={<CloseOutlined />}
            onClick={close}
            aria-label={t("cancel")}
          />
        </div>
      }
    >
      {transaction &&
        (editing ? (
          <div className="finance-drawer-form">
            <TransactionForm transaction={transaction} onSaved={close} />
            <Button
              className="finance-danger-button"
              onClick={() => setEditing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        ) : (
          <div className="finance-transaction-detail">
            <div className="finance-merchant">
              <div className="finance-tx-icon">
                <CategoryIcon
                  name={
                    categories.find(
                      (category) => category.id === transaction.categoryId,
                    )?.icon ?? ""
                  }
                />
              </div>
              <div>
                <h2>{transaction.counterparty || t("unknown")}</h2>
                <span className="finance-muted">
                  {t(
                    transaction.type === TransactionType.INCOME
                      ? "income"
                      : "expenses",
                  )}
                </span>
              </div>
            </div>
            <div
              className={`finance-big-amount ${transaction.type === TransactionType.INCOME ? "finance-income" : "finance-expense"}`}
            >
              {formatMoney(
                transaction.amount?.minorUnits ?? 0n,
                transaction.amount?.currencyCode ?? "EUR",
                i18n.language,
              )}
            </div>
            <div className="finance-details-list">
              <Detail
                label={t("category")}
                value={categoryName(
                  categories.find(
                    (category) => category.id === transaction.categoryId,
                  ),
                  t,
                )}
              />
              <Detail
                label={t("date")}
                value={formatDate(
                  transaction.date,
                  i18n.language,
                  settings?.dateFormat ?? "yyyy-MM-dd",
                )}
              />
              <Detail
                label={t("type")}
                value={t(
                  transaction.type === TransactionType.INCOME
                    ? "income"
                    : "expenses",
                )}
              />
              <Detail label={t("note")} value={transaction.note || "—"} />
            </div>
            <div className="finance-drawer-actions">
              <Button
                id="transaction-edit-button"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                {t("edit")}
              </Button>
              {onDelete && (
                <Button
                  id="transaction-delete-button"
                  danger
                  className="finance-danger-button"
                  icon={<DeleteOutlined />}
                  onClick={() => onDelete(transaction)}
                >
                  {t("delete")}
                </Button>
              )}
            </div>
          </div>
        ))}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
