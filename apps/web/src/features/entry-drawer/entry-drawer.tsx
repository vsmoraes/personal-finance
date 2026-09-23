import { CloseOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Modal, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { EntityForm } from "../entity-form.tsx";
import { TransactionForm } from "../transaction-form.tsx";
import type { EntryDraft } from "./entry-draft.ts";

/** The sole presentation surface for creating and editing a resource. */
export function EntryDrawer({
  draft,
  onClose,
  onDelete,
}: {
  draft: EntryDraft | undefined;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={Boolean(draft)}
      onCancel={onClose}
      centered
      width={620}
      destroyOnHidden
      closable={false}
      footer={null}
      className="finance-frosted-modal finance-entry-modal"
      title={
        <div className="finance-drawer-head">
          <span className="finance-eyebrow">
            {draft?.resource === "transactions"
              ? t(draft.entity ? "editTransaction" : "addTransaction")
              : t(draft?.entity ? "edit" : "create")}
          </span>
          <Button
            id="entry-drawer-close"
            type="text"
            shape="circle"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label={t("cancel")}
          />
        </div>
      }
    >
      {draft && (
        <ConfigProvider
          getPopupContainer={(trigger) =>
            trigger?.parentElement ?? document.body
          }
        >
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Typography.Paragraph type="secondary">
              {t(
                draft.resource === "transactions"
                  ? "transactionEntryHelp"
                  : `${draft.resource}Description`,
              )}
            </Typography.Paragraph>
            {draft.resource === "transactions" ? (
              <TransactionForm
                key={`transactions:${draft.entity?.id ?? "new"}`}
                {...(draft.entity ? { transaction: draft.entity } : {})}
                onSaved={onClose}
              />
            ) : (
              <EntityForm
                key={`${draft.resource}:${draft.entity?.id ?? "new"}`}
                resource={draft.resource}
                entity={draft.entity}
                onSaved={onClose}
              />
            )}
            {draft.entity && onDelete && (
              <Button
                id="entry-delete-button"
                danger
                className="finance-danger-button"
                block
                onClick={onDelete}
              >
                {t("delete")}
              </Button>
            )}
          </Space>
        </ConfigProvider>
      )}
    </Modal>
  );
}
