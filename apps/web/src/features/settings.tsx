import {
  BgColorsOutlined,
  CalendarOutlined,
  ControlOutlined,
  ImportOutlined,
} from "@ant-design/icons";
import { create } from "@bufbuild/protobuf";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  type Settings,
  SettingsSchema,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { saveMessage, useRefresh, useSettings } from "../shared/api.ts";
import {
  App as AntApp,
  Button,
  Form,
  Select,
} from "../shared/design-system.tsx";
import { currencies, Field } from "../shared/forms.tsx";
import {
  ErrorNotice,
  Loading,
  PageTitle,
  Preference,
  SettingsSection,
} from "../shared/ui.tsx";
export function SettingsPage() {
  const { t } = useTranslation();
  const query = useSettings();
  return (
    <>
      <PageTitle title={t("settings")} subtitle={t("settingsDescription")} />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} />
      ) : (
        <SettingsForm settings={query.data} />
      )}
    </>
  );
}
function SettingsForm({ settings }: { settings: Settings }) {
  const { t, i18n } = useTranslation();
  const refresh = useRefresh("settings");
  const { message } = AntApp.useApp();
  const [error, setError] = useState<unknown>();
  const [section, setSection] = useState("general");
  const sections = [
    { key: "general", label: t("preferences"), icon: <ControlOutlined /> },
    {
      key: "appearance",
      label: t("themeSettings"),
      icon: <BgColorsOutlined />,
    },
    {
      key: "display",
      label: t("displayPreferences"),
      icon: <CalendarOutlined />,
    },
    { key: "imports", label: t("importDefaults"), icon: <ImportOutlined /> },
  ];
  const form = useForm({
    defaultValues: {
      ...settings,
      theme: settings.theme === "purple" ? "light" : settings.theme,
      customBackground: settings.customBackground || "#F5F5F5",
      customSurface: settings.customSurface || "#FFFFFF",
      customAccent: settings.customAccent || "#1677FF",
      customAccentSecondary: settings.customAccentSecondary || "#69B1FF",
      customSidebarAccent: settings.customSidebarAccent || "#1677FF",
      customSidebarAccentSecondary:
        settings.customSidebarAccentSecondary || "#E6F4FF",
      customMode: settings.customMode || "light",
      language: settings.language || i18n.language,
      firstDayOfWeek: String(settings.firstDayOfWeek),
      reportYear: String(settings.reportYear),
    },
  });
  const selectedTheme = useWatch({ control: form.control, name: "theme" });
  const submit = form.handleSubmit(async (v) => {
    try {
      const saved = await saveMessage(
        "settings",
        SettingsSchema,
        create(SettingsSchema, {
          ...v,
          firstDayOfWeek: Number(v.firstDayOfWeek),
          reportYear: Number(v.reportYear),
        }),
        "PATCH",
      );
      form.setValue("version", saved.version);
      await i18n.changeLanguage(v.language);
      refresh();
      void message.success(t("saved"));
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  });
  return (
    <Form
      id="settings-form"
      className="finance-settings-page"
      layout="vertical"
      onFinish={() => {
        void submit();
      }}
    >
      {error ? <ErrorNotice error={error} /> : null}
      <div className="finance-settings-layout">
        <aside className="finance-settings-nav" aria-label={t("settings")}>
          <div id="settings-section-mobile">
            <Select
              className="finance-settings-mobile-select"
              value={section}
              onChange={setSection}
              options={sections.map(({ key, label }) => ({
                value: key,
                label,
              }))}
              optionRender={(option) => (
                <span id={`settings-mobile-option-${option.value}`}>
                  {option.label}
                </span>
              )}
              aria-label={t("settings")}
            />
          </div>
          {sections.map(({ key, label, icon }) => (
            <Button
              id={`settings-section-${key}`}
              type="text"
              htmlType="button"
              key={key}
              icon={icon}
              className={section === key ? "active" : ""}
              onClick={() => setSection(key)}
            >
              {label}
            </Button>
          ))}
        </aside>
        <div className="finance-settings-content">
          {section === "general" && (
            <SettingsSection
              title={t("preferences")}
              description={t("generalSettingsHelp")}
            >
              <Preference
                label={t("language")}
                help={t("languageSettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="language"
                  label="language"
                  presentation="control"
                  options={[
                    { value: "en", label: "English" },
                    { value: "es", label: "Español" },
                    { value: "pt-BR", label: "Português (Brasil)" },
                  ]}
                />
              </Preference>
              <Preference
                label={t("timezone")}
                help={t("timezoneSettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="timezone"
                  label="timezone"
                  presentation="control"
                  options={["UTC", ...Intl.supportedValuesOf("timeZone")].map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Preference>
            </SettingsSection>
          )}
          {section === "appearance" && (
            <SettingsSection
              title={t("themeSettings")}
              description={t("customColorsHelp")}
            >
              <Preference label={t("theme")} help={t("themeSettingsHelp")}>
                <Field
                  control={form.control}
                  name="theme"
                  label="theme"
                  presentation="control"
                  options={["system", "light", "dark", "custom"].map(
                    (value) => ({
                      value,
                      label: t(value),
                    }),
                  )}
                />
              </Preference>
              {selectedTheme === "custom" && (
                <>
                  <Preference label={t("customMode")}>
                    <Field
                      control={form.control}
                      name="customMode"
                      label="customMode"
                      presentation="control"
                      options={["light", "dark"].map((value) => ({
                        value,
                        label: t(value),
                      }))}
                    />
                  </Preference>
                  <Preference
                    label={t("customBackground")}
                    help={t("customBackgroundHelp")}
                  >
                    <Field
                      control={form.control}
                      name="customBackground"
                      label="customBackground"
                      type="color"
                      presentation="control"
                    />
                  </Preference>
                  <Preference
                    label={t("customSurface")}
                    help={t("customSurfaceHelp")}
                  >
                    <Field
                      control={form.control}
                      name="customSurface"
                      label="customSurface"
                      type="color"
                      presentation="control"
                    />
                  </Preference>
                  <Preference
                    label={t("customAccent")}
                    help={t("customAccentHelp")}
                  >
                    <Field
                      control={form.control}
                      name="customAccent"
                      label="customAccent"
                      type="color"
                      presentation="control"
                    />
                  </Preference>
                  <Preference label={t("customAccentSecondary")}>
                    <Field
                      control={form.control}
                      name="customAccentSecondary"
                      label="customAccentSecondary"
                      type="color"
                      presentation="control"
                    />
                  </Preference>
                  <Preference label={t("customSidebarAccent")}>
                    <Field
                      control={form.control}
                      name="customSidebarAccent"
                      label="customSidebarAccent"
                      type="color"
                      presentation="control"
                    />
                  </Preference>
                  <Preference label={t("customSidebarAccentSecondary")}>
                    <Field
                      control={form.control}
                      name="customSidebarAccentSecondary"
                      label="customSidebarAccentSecondary"
                      type="color"
                      presentation="control"
                    />
                  </Preference>
                </>
              )}
            </SettingsSection>
          )}
          {section === "display" && (
            <SettingsSection
              title={t("displayPreferences")}
              description={t("displaySettingsHelp")}
            >
              <Preference
                label={t("defaultCurrency")}
                help={t("defaultCurrencyHelp")}
              >
                <Field
                  control={form.control}
                  name="defaultCurrency"
                  label="defaultCurrency"
                  presentation="control"
                  options={currencies}
                />
              </Preference>
              <Preference
                label={t("dateFormat")}
                help={t("dateFormatSettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="dateFormat"
                  label="dateFormat"
                  presentation="control"
                  options={["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Preference>
              <Preference
                label={t("reportYear")}
                help={t("reportYearSettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="reportYear"
                  label="reportYear"
                  type="number"
                  presentation="control"
                />
              </Preference>
            </SettingsSection>
          )}
          {section === "imports" && (
            <SettingsSection
              title={t("importDefaults")}
              description={t("importSettingsHelp")}
            >
              <Preference
                label={t("importCurrency")}
                help={t("importCurrencySettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="importCurrency"
                  label="importCurrency"
                  presentation="control"
                  options={currencies}
                />
              </Preference>
              <Preference
                label={t("importDateFormat")}
                help={t("importDateSettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="importDateFormat"
                  label="importDateFormat"
                  presentation="control"
                  options={["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Preference>
              <Preference
                label={t("importDecimalSeparator")}
                help={t("importDecimalSettingsHelp")}
              >
                <Field
                  control={form.control}
                  name="importDecimalSeparator"
                  label="importDecimalSeparator"
                  presentation="control"
                  options={[
                    { value: ".", label: t("decimalDot") },
                    { value: ",", label: t("decimalComma") },
                  ]}
                />
              </Preference>
            </SettingsSection>
          )}
          <div className="finance-settings-actions">
            <Button
              id="settings-save-button"
              type="primary"
              htmlType="submit"
              loading={form.formState.isSubmitting}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </div>
    </Form>
  );
}
