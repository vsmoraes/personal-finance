import {
  BankOutlined,
  BarChartOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FilterOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PieChartOutlined,
  ReloadOutlined,
  SettingOutlined,
  SwapOutlined,
  TagsOutlined,
  UploadOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  App as AntApp,
  Avatar,
  ConfigProvider,
  Drawer,
  Flex,
  Grid,
  Layout,
  Menu,
  theme,
  Typography,
} from "antd";
import en from "antd/locale/en_US.js";
import es from "antd/locale/es_ES.js";
import pt from "antd/locale/pt_BR.js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Route, Routes, useLocation } from "react-router";

import { Configuration } from "./features/configuration.tsx";
import { type EntryDraft, EntryDrawer } from "./features/entry-drawer.tsx";
import { Imports } from "./features/imports.tsx";
import { Reports } from "./features/reports.tsx";
import { SettingsPage } from "./features/settings.tsx";
import { TopBar } from "./features/top-bar.tsx";
import { Transactions } from "./features/transactions.tsx";
import { useSettings } from "./shared/api.ts";
import { ErrorNotice, Loading, Retry } from "./shared/ui.tsx";
const navigation = [
  {
    label: "workspace",
    items: [
      ["/", "dashboard", DashboardOutlined],
      ["/transactions", "transactions", SwapOutlined],
      ["/imports", "imports", UploadOutlined],
    ],
  },
  {
    label: "planning",
    items: [
      ["/budgets", "budgets", WalletOutlined],
      ["/recurring-commitments", "recurring-commitments", ReloadOutlined],
      ["/forecast", "forecast", LineChartOutlined],
      ["/scenarios", "scenarios", ExperimentOutlined],
    ],
  },
  {
    label: "insights",
    items: [
      ["/monthly", "monthly", BarChartOutlined],
      ["/category-report", "categoryReport", PieChartOutlined],
    ],
  },
  {
    label: "organization",
    items: [
      ["/categories", "categoriesTitle", TagsOutlined],
      ["/categorization-rules", "categorization-rules", FilterOutlined],
      ["/settings", "settings", SettingOutlined],
    ],
  },
] as const;
export function App() {
  const { t, i18n } = useTranslation();
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (settings?.language && settings.language !== i18n.language)
      void i18n.changeLanguage(settings.language);
    document.documentElement.lang = i18n.language;
    document.title = t("appName");
  }, [settings?.language, i18n, i18n.language, t]);
  if (settingsQuery.isPending) return <Loading />;
  if (settingsQuery.error)
    return (
      <>
        <ErrorNotice error={settingsQuery.error} />
        <Retry
          onClick={() => {
            void settingsQuery.refetch();
          }}
        />
      </>
    );
  const custom = settings?.theme === "custom";
  const dark =
    settings?.theme === "dark" ||
    (custom && settings?.customMode === "dark") ||
    (settings?.theme === "system" && systemDark);
  return (
    <ConfigProvider
      locale={
        i18n.language === "es"
          ? es.default
          : i18n.language === "pt-BR"
            ? pt.default
            : en.default
      }
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          borderRadiusLG: 6,
          colorPrimary: "#5b63f6",
          colorInfo: "#5b63f6",
          ...(dark
            ? {
                colorBgLayout: "#10111f",
                colorBgContainer: "#181a2b",
                colorBgElevated: "#20233a",
                colorBorderSecondary: "#2c304a",
              }
            : {
                colorBgLayout: "#f6f7fc",
                colorBgContainer: "#ffffff",
                colorBorderSecondary: "#e9eaf2",
              }),
        },
        ...(custom
          ? {
              token: {
                colorPrimary: settings?.customAccent || "#1677FF",
                colorPrimaryBg: settings?.customAccentSecondary || "#69B1FF",
                colorPrimaryBgHover:
                  settings?.customAccentSecondary || "#69B1FF",
                colorSuccess: settings?.customAccent || "#1677FF",
                colorInfo: settings?.customAccentSecondary || "#69B1FF",
                colorLink: settings?.customAccentSecondary || "#69B1FF",
                colorBgBase: settings?.customBackground || "#F5F5F5",
                colorBgLayout: settings?.customBackground || "#F5F5F5",
                colorBgContainer: settings?.customSurface || "#FFFFFF",
                colorBgElevated: settings?.customSurface || "#FFFFFF",
                colorTextBase: dark ? "#f7f8ff" : "#1f2233",
                colorTextSecondary: dark ? "#bbc0d4" : "#62677d",
              },
              components: {
                Menu: {
                  itemSelectedBg:
                    settings?.customSidebarAccentSecondary || "#E6F4FF",
                  itemSelectedColor: settings?.customSidebarAccent || "#1677FF",
                  itemHoverBg:
                    settings?.customSidebarAccentSecondary || "#E6F4FF",
                },
              },
            }
          : {}),
      }}
    >
      <AntApp>
        <Workspace
          dark={dark}
          {...(custom
            ? { sidebarAccent: settings?.customSidebarAccent || "#1677FF" }
            : {})}
        />
      </AntApp>
    </ConfigProvider>
  );
}
function Workspace({
  dark,
  sidebarAccent,
}: {
  dark: boolean;
  sidebarAccent?: string;
}) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>();
  const [collapsed, setCollapsed] = useState(false);
  const activeGroup = navigation.find((group) =>
    group.items.some(([path]) => path === location.pathname),
  )?.label;
  const [openGroups, setOpenGroups] = useState<string[]>(
    activeGroup ? [activeGroup] : [],
  );
  useEffect(() => {
    if (activeGroup) setOpenGroups([activeGroup]);
  }, [activeGroup]);
  const current = navigation
    .map((group) => group.items.find(([path]) => path === location.pathname))
    .find((item) => item !== undefined);
  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      openKeys={openGroups}
      onOpenChange={(keys) => setOpenGroups(keys.map(String))}
      style={{ borderInlineEnd: 0 }}
      items={navigation.map((group) => {
        const GroupIcon = group.items[0]?.[2];
        return {
          key: group.label,
          label: t(group.label),
          ...(GroupIcon ? { icon: <GroupIcon /> } : {}),
          children: group.items.map(([path, label, Icon]) => ({
            key: path,
            icon: <Icon />,
            label: (
              <Link to={path} onClick={() => setOpen(false)}>
                {t(label)}
              </Link>
            ),
          })),
        };
      })}
    />
  );
  const brand = (
    <Flex
      className="finance-brand"
      align="center"
      justify={collapsed ? "center" : "flex-start"}
      gap="middle"
      style={{ padding: collapsed ? 16 : 24 }}
    >
      <Avatar
        shape="square"
        size={40}
        icon={<BankOutlined />}
        style={{ color: token.colorPrimary, background: token.colorPrimaryBg }}
      />
      {!collapsed && <Typography.Text strong>{t("appName")}</Typography.Text>}
    </Flex>
  );
  return (
    <Layout className="finance-shell" style={{ minHeight: "100dvh" }}>
      {screens.lg && (
        <Layout.Sider
          width={256}
          className="finance-sider"
          collapsed={collapsed}
          collapsedWidth={72}
          collapsible
          onCollapse={setCollapsed}
          trigger={
            <span
              aria-label={t("collapseSidebar")}
              style={{ color: sidebarAccent ?? token.colorPrimary }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
          }
          theme={dark ? "dark" : "light"}
          style={{
            height: "100dvh",
            position: "sticky",
            top: 0,
            display: "flex",
            flexDirection: "column",
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {brand}
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{menu}</div>
          {!collapsed && (
            <Flex style={{ padding: 24 }}>
              <Typography.Text type="secondary">
                {t("privateProfile")}
              </Typography.Text>
            </Flex>
          )}
        </Layout.Sider>
      )}
      <Layout style={{ minWidth: 0 }}>
        <Layout.Header
          className="finance-header"
          style={{
            paddingInline: screens.sm ? 32 : 16,
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <TopBar
            currentLabel={t(current?.[1] ?? "dashboard")}
            compact={!screens.lg}
            onMenu={() => setOpen(true)}
            onCreate={setDraft}
          />
        </Layout.Header>
        <Layout.Content
          className="finance-content"
          style={{
            padding: screens.sm ? 32 : 16,
            minWidth: 0,
            width: "100%",
            maxWidth: 1660,
            marginInline: "auto",
          }}
        >
          <Routes>
            <Route path="/" element={<Reports />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/monthly" element={<Reports kind="monthly" />} />
            <Route
              path="/category-report"
              element={<Reports kind="categories" />}
            />
            <Route path="/forecast" element={<Reports kind="forecast" />} />
            {(
              [
                "categories",
                "budgets",
                "recurring-commitments",
                "categorization-rules",
                "scenarios",
              ] as const
            ).map((resource) => (
              <Route
                key={resource}
                path={`/${resource}`}
                element={<Configuration resource={resource} />}
              />
            ))}
            <Route path="/imports" element={<Imports />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Reports />} />
          </Routes>
        </Layout.Content>
      </Layout>
      <Drawer
        title={t("appName")}
        placement="left"
        open={open}
        onClose={() => setOpen(false)}
        width={290}
      >
        {menu}
      </Drawer>
      <EntryDrawer draft={draft} onClose={() => setDraft(undefined)} />
    </Layout>
  );
}
