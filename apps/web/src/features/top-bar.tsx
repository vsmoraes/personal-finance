import { MenuOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Dropdown, Flex, Space, theme, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { CreateEntryButton, type EntryDraft } from "./entry-drawer.tsx";

export function TopBar({
  currentLabel,
  compact,
  onMenu,
  onCreate,
}: {
  currentLabel: string;
  compact: boolean;
  onMenu: () => void;
  onCreate: (draft: EntryDraft) => void;
}) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  return (
    <Flex
      justify="space-between"
      align="center"
      gap="middle"
      style={{ height: "100%" }}
    >
      <Space>
        <Button
          type="text"
          icon={<MenuOutlined />}
          aria-label={t("menu")}
          onClick={onMenu}
          style={{ display: compact ? undefined : "none" }}
        />
        <Typography.Title
          className="topbar-page-title"
          level={2}
          style={{ margin: 0 }}
        >
          {currentLabel}
        </Typography.Title>
      </Space>
      <Space>
        <CreateEntryButton onCreate={onCreate} compact={compact} />
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              {
                key: "settings",
                icon: <SettingOutlined />,
                label: <a href="/settings">{t("settings")}</a>,
              },
              { type: "divider" },
              {
                key: "profile",
                icon: <UserOutlined />,
                label: t("profile"),
                disabled: true,
              },
            ],
          }}
        >
          <Button
            type="text"
            icon={<UserOutlined />}
            aria-label={t("accountMenu")}
            style={{ color: token.colorText }}
          />
        </Dropdown>
      </Space>
    </Flex>
  );
}
