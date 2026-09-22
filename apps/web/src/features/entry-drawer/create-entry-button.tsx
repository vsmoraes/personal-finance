import { DownOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Dropdown, Space } from "antd";
import { useTranslation } from "react-i18next";

import type { EntryDraft } from "./entry-draft.ts";

const resources = [
  "categories",
  "budgets",
  "recurring-commitments",
  "categorization-rules",
  "scenarios",
] as const;

export function CreateEntryButton({
  onCreate,
  compact = false,
}: {
  onCreate: (draft: EntryDraft) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Space.Compact>
      <Button
        type="primary"
        icon={<PlusOutlined aria-hidden />}
        aria-label={t("addTransaction")}
        onClick={() => onCreate({ resource: "transactions" })}
      >
        {compact ? null : t("addTransaction")}
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
