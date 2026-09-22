import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  MenuOutlined,
  SettingOutlined,
  SwapOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { App as AntApp, ConfigProvider, theme } from "antd";
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
import { Transactions } from "./features/transactions.tsx";
import { useSettings } from "./shared/api.ts";
import { ErrorNotice, Loading, Retry } from "./shared/ui.tsx";
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
          borderRadius: 16,
          borderRadiusLG: 28,
          colorPrimary: dark ? "#67d6a5" : "#1f7a5b",
          colorInfo: dark ? "#67d6a5" : "#1f7a5b",
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
function Workspace({ dark }: { dark: boolean; sidebarAccent?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>();
  useEffect(() => {
    const createTransaction = () => setDraft({ resource: "transactions" });
    window.addEventListener("finance:create-transaction", createTransaction);
    return () =>
      window.removeEventListener(
        "finance:create-transaction",
        createTransaction,
      );
  }, []);
  const nav = [
    {
      label: t("workspace"),
      icon: DashboardOutlined,
      items: [
        ["/", t("dashboard"), DashboardOutlined],
        ["/transactions", t("transactions"), SwapOutlined],
        ["/imports", t("imports"), AppstoreOutlined],
      ],
    },
    {
      label: t("planning"),
      icon: WalletOutlined,
      items: [
        ["/budgets", t("budgets"), WalletOutlined],
        ["/forecast", t("forecast"), BarChartOutlined],
        ["/scenarios", t("scenarios"), AppstoreOutlined],
      ],
    },
    {
      label: t("insights"),
      icon: BarChartOutlined,
      items: [
        ["/category-report", t("categoryReport"), BarChartOutlined],
        ["/monthly", t("monthly"), BarChartOutlined],
      ],
    },
    {
      label: t("organization"),
      icon: AppstoreOutlined,
      items: [
        ["/categories", t("categoriesTitle"), AppstoreOutlined],
        ["/recurring-commitments", t("recurring-commitments"), SwapOutlined],
        ["/categorization-rules", t("categorization-rules"), AppstoreOutlined],
        ["/settings", t("settings"), SettingOutlined],
      ],
    },
  ] as {
    label: string;
    icon: typeof DashboardOutlined;
    items: [string, string, typeof DashboardOutlined][];
  }[];
  const desktopNavigation = (
    <nav className="finance-nav finance-groups">
      {nav.map((group) => (
        <div
          className={`finance-group ${group.items.some(([path]) => path === location.pathname) ? "active" : ""}`}
          key={group.label}
        >
          <button id={`nav-group-${group.label.toLowerCase()}`} type="button">
            <group.icon />
            {group.label}
          </button>
          <div className="finance-drop">
            {group.items.map(([path, label, Icon]) => (
              <Link
                id={`nav-link-${path === "/" ? "overview" : path.slice(1)}`}
                key={path}
                to={path}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
  return (
    <div className={`finance-shell ${dark ? "finance-dark" : ""}`}>
      <header className="finance-topbar finance-glass">
        <Link to="/" className="finance-brand">
          <i />
          {t("appName")}
        </Link>
        {desktopNavigation}
        <div className="finance-topbar-spacer" aria-hidden="true" />
      </header>
      <main
        id={`page-${location.pathname === "/" ? "overview" : location.pathname.slice(1)}`}
        className="finance-content"
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
      </main>
      <EntryDrawer draft={draft} onClose={() => setDraft(undefined)} />
      <nav className="finance-mobilebar finance-glass">
        {nav.slice(0, 3).map((group) => {
          const Icon = group.icon;
          const target = group.items[0]?.[0] ?? "/";
          return (
            <Link
              id={`mobile-nav-${target === "/" ? "overview" : target.slice(1)}`}
              key={group.label}
              to={target}
              className={
                group.items.some(([path]) => path === location.pathname)
                  ? "active"
                  : ""
              }
            >
              <Icon />
              <span>{group.label}</span>
            </Link>
          );
        })}
        <button
          id="mobile-more-button"
          type="button"
          onClick={() => setMoreOpen(true)}
        >
          <MenuOutlined />
          <span>{t("more")}</span>
        </button>
      </nav>
      {moreOpen && (
        <div
          className="finance-more-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setMoreOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter")
              setMoreOpen(false);
          }}
        >
          <section
            id="mobile-more-sheet"
            className="finance-more-sheet"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <div className="finance-sheet-head">
              <strong>{t("more")}</strong>
              <button onClick={() => setMoreOpen(false)}>×</button>
            </div>
            {nav.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.label}>
                  <div className="finance-section-label">
                    <Icon /> {group.label}
                  </div>
                  <div className="finance-menu-grid">
                    {group.items.map(([path, label, ItemIcon]) => (
                      <Link
                        id={`mobile-more-link-${path === "/" ? "overview" : path.slice(1)}`}
                        key={path}
                        to={path}
                        onClick={() => setMoreOpen(false)}
                      >
                        <ItemIcon /> {label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
