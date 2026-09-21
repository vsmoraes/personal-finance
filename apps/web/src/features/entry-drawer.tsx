import { DownOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  ConfigProvider,
  Drawer,
  Dropdown,
  Grid,
  Space,
  Typography,
} from "antd";
import { useTranslation } from "react-i18next";

import type { Transaction } from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { type Entity, EntityForm, type Resource } from "./entity-form.tsx";
import { TransactionForm } from "./transaction-form.tsx";

export type EntryDraft =
  | { resource: "transactions"; entity?: Transaction }
  | { resource: Resource; entity?: Entity };

/** One entry surface shared by Overview and every resource page. */
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

export function CreateEntryButton({
  onCreate,
}: {
  onCreate: (draft: EntryDraft) => void;
}) {
  const { t } = useTranslation();
  const resources = [
    "categories",
    "budgets",
    "recurring-commitments",
    "categorization-rules",
    "scenarios",
  ] as const;
  return (
    <Space.Compact>
      <Button
        type="primary"
        icon={<PlusOutlined aria-hidden />}
        onClick={() => onCreate({ resource: "transactions" })}
      >
        {t("addTransaction")}
      </Button>
      <Dropdown
        trigger={["click"]}
        menu={{
          items: resources.map((resource) => ({
            key: resource,
            label: t(resource === "categories" ? "categoriesTitle" : resource),
            onClick: () => onCreate({ resource }),
          })),
        }}
      >
        <Button
          type="primary"
          icon={<DownOutlined aria-hidden />}
          aria-label={t("createOtherEntry")}
        />
      </Dropdown>
    </Space.Compact>
  );
}
