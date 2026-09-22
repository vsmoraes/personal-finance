import { Button, ConfigProvider, Drawer, Grid, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { EntityForm } from "../entity-form.tsx";
import { TransactionForm } from "../transaction-form.tsx";
import type { EntryDraft } from "./entry-draft.ts";

/** The sole presentation surface for creating and editing a resource. */
export function EntryDrawer({
  draft,
  onClose,
}: {
  draft: EntryDraft | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  return (
    <Drawer
      open={Boolean(draft)}
      onClose={onClose}
      width={screens.sm ? 600 : "100%"}
      destroyOnHidden
      title={
        draft?.resource === "transactions"
          ? t(draft.entity ? "editTransaction" : "addTransaction")
          : t(draft?.entity ? "edit" : "create")
      }
      extra={<Button onClick={onClose}>{t("cancel")}</Button>}
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
          </Space>
        </ConfigProvider>
      )}
    </Drawer>
  );
}
