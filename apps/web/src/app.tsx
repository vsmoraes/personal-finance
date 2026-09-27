import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  MenuOutlined,
  SettingOutlined,
  SwapOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
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
import {
  type AuthUser,
  currentSession,
  LoginPage,
  SignOutButton,
  UserPhoto,
} from "./shared/auth.tsx";
import {
  App as AntApp,
  Button,
  ConfigProvider,
} from "./shared/design-system.tsx";
import {
  applyDesignSystemTheme,
  designSystemTheme,
} from "./shared/design-system.tsx";
import { ErrorNotice, Loading, Retry } from "./shared/ui.tsx";
export function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: currentSession,
    retry: false,
  });
  if (session.isPending) return <Loading />;
  if (session.isError) return <LoginPage />;
  return <AuthenticatedApp user={session.data.user} />;
}
function AuthenticatedApp({ user }: { user: AuthUser }) {
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
  const custom = settings?.theme === "custom";
  const dark =
    settings?.theme === "dark" ||
    (custom && settings?.customMode === "dark") ||
    (settings?.theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("finance-dark-mode", dark);
    return () => document.documentElement.classList.remove("finance-dark-mode");
  }, [dark]);
  useEffect(() => {
    applyDesignSystemTheme(settings, dark);
  }, [settings, dark]);
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
  return (
    <ConfigProvider
      locale={
        i18n.language === "es"
          ? es.default
          : i18n.language === "pt-BR"
            ? pt.default
            : en.default
      }
      theme={designSystemTheme(settings, dark)}
    >
      <AntApp>
        <Workspace
          dark={dark}
          user={user}
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
  user,
}: {
  dark: boolean;
  user: AuthUser;
  sidebarAccent?: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>();
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
  const mobileNavigation = [
    {
      path: "/",
      label: t("dashboard"),
      icon: DashboardOutlined,
      active: location.pathname === "/",
    },
    {
      path: "/transactions",
      label: t("transactions"),
      icon: SwapOutlined,
      active: location.pathname === "/transactions",
    },
    {
      path: "/category-report",
      label: t("insights"),
      icon: BarChartOutlined,
      active: ["/category-report", "/monthly"].includes(location.pathname),
    },
  ];
  const desktopNavigation = (
    <nav className="finance-nav finance-groups">
      {nav.map((group) => (
        <div
          className={`finance-group ${group.items.some(([path]) => path === location.pathname) ? "active" : ""}`}
          key={group.label}
          onMouseEnter={() => {
            setProfileOpen(false);
            setOpenNavGroup(group.label);
          }}
          onFocus={() => {
            setProfileOpen(false);
            setOpenNavGroup(group.label);
          }}
        >
          <Button
            id={`nav-group-${group.label.toLowerCase()}`}
            type="text"
            htmlType="button"
            aria-expanded={openNavGroup === group.label}
            onClick={() => {
              setProfileOpen(false);
              setOpenNavGroup((open) =>
                open === group.label ? null : group.label,
              );
            }}
          >
            <group.icon />
            {group.label}
          </Button>
          <div
            className={`finance-drop ${openNavGroup === group.label ? "is-open" : ""}`}
          >
            {group.items.map(([path, label, Icon]) => (
              <Link
                id={`nav-link-${path === "/" ? "overview" : path.slice(1)}`}
                key={path}
                to={path}
                onClick={() => setOpenNavGroup(null)}
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
    <div
      className={`finance-shell ${dark ? "finance-dark" : ""} ${location.pathname === "/" ? "finance-overview-shell" : ""}`}
    >
      <header
        className={`finance-topbar finance-glass ${openNavGroup || profileOpen ? "is-expanded" : ""}`}
        onMouseLeave={() => {
          setOpenNavGroup(null);
          setProfileOpen(false);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpenNavGroup(null);
            setProfileOpen(false);
          }
        }}
      >
        <Link to="/" className="finance-brand">
          <i />
          {t("appName")}
        </Link>
        {desktopNavigation}
        <div className="finance-topbar-spacer" aria-hidden="true" />
        <UserPhoto
          user={user}
          compact
          expanded={profileOpen}
          onOpen={() => {
            setOpenNavGroup(null);
            setProfileOpen(true);
          }}
        />
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
        {mobileNavigation.map(({ path, label, icon: Icon, active }) => {
          return (
            <Link
              id={`mobile-nav-${path === "/" ? "overview" : path === "/category-report" ? "insights" : path.slice(1)}`}
              key={path}
              to={path}
              className={active ? "active" : ""}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
        <Button
          id="mobile-more-button"
          type="text"
          htmlType="button"
          className={
            moreOpen || !mobileNavigation.some(({ active }) => active)
              ? "active"
              : ""
          }
          onClick={() => setMoreOpen(true)}
        >
          <MenuOutlined />
          <span>{t("more")}</span>
        </Button>
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
              <Button
                type="text"
                htmlType="button"
                aria-label={t("cancel")}
                onClick={() => setMoreOpen(false)}
              >
                ×
              </Button>
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
            <UserPhoto user={user} />
            <SignOutButton id="mobile-sign-out-button" />
          </section>
        </div>
      )}
    </div>
  );
}
