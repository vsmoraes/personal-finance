import { create } from "@bufbuild/protobuf";
import { App as AntApp, Button, Card, Flex, Form, Typography } from "antd";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  type Settings,
  SettingsSchema,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { saveMessage, useRefresh, useSettings } from "../shared/api.ts";
import { currencies, Field } from "../shared/forms.tsx";
import { ErrorNotice, Loading, PageTitle } from "../shared/ui.tsx";
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
  const form = useForm({
    defaultValues: {
      ...settings,
      theme:
        settings.theme === "purple" || settings.theme === "system"
          ? "light"
          : settings.theme,
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
    <Card className="finance-settings-card">
      <Form
        id="settings-form"
        layout="vertical"
        onFinish={() => {
          void submit();
        }}
      >
        <Flex vertical gap="large">
          {error ? <ErrorNotice error={error} /> : null}
          <div className="finance-settings-layout">
            <aside className="finance-settings-nav">
              {[
                ["general", t("preferences")],
                ["appearance", t("themeSettings")],
                ["display", t("displayPreferences")],
                ["imports", t("importDefaults")],
              ].map(([key, label]) => (
                <button
                  id={`settings-section-${key}`}
                  type="button"
                  key={key}
                  className={section === key ? "active" : ""}
                  onClick={() => setSection(key ?? "general")}
                >
                  {label}
                </button>
              ))}
            </aside>
            <div className="finance-settings-content">
              {section === "general" && (
                <SettingsSection
                  title={t("preferences")}
                  description={t("settingsDescription")}
                >
                  <Preference
                    label={t("language")}
                    help="Language used throughout the application."
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
                    help="Used to interpret transaction dates."
                  >
                    <Field
                      control={form.control}
                      name="timezone"
                      label="timezone"
                      presentation="control"
                      options={[
                        "UTC",
                        ...Intl.supportedValuesOf("timeZone"),
                      ].map((value) => ({ value, label: value }))}
                    />
                  </Preference>
                </SettingsSection>
              )}
              {section === "appearance" && (
                <SettingsSection
                  title={t("themeSettings")}
                  description={t("customColorsHelp")}
                >
                  <Preference
                    label={t("theme")}
                    help="Choose how the interface appears."
                  >
                    <Field
                      control={form.control}
                      name="theme"
                      label="theme"
                      presentation="control"
                      options={["light", "dark", "custom"].map((value) => ({
                        value,
                        label: t(value),
                      }))}
                    />
                  </Preference>
                  {form.watch("theme") === "custom" && (
                    <>
                      <Preference
                        label={t("customBackground")}
                        help="Page background color."
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
                        help="Cards and panels color."
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
                        help="Primary action color."
                      >
                        <Field
                          control={form.control}
                          name="customAccent"
                          label="customAccent"
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
                  description="Choose the formats used in lists and reports."
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
                    help="How dates are shown."
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
                    help="Default year for reports."
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
                  description="Defaults used while importing financial data."
                >
                  <Preference
                    label={t("importCurrency")}
                    help="Currency used when an import does not declare one."
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
                    help="Expected date format in CSV files."
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
                    help="Decimal separator expected in imports."
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
            </div>
          </div>
          <Flex justify="end">
            <Button
              id="settings-save-button"
              type="primary"
              htmlType="submit"
              loading={form.formState.isSubmitting}
            >
              {t("save")}
            </Button>
          </Flex>
        </Flex>
      </Form>
    </Card>
  );
}
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <Typography.Paragraph type="secondary">
        {description}
      </Typography.Paragraph>
      <div className="finance-preference-card">{children}</div>
    </section>
  );
}
function Preference({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="finance-preference-row">
      <div>
        <strong>{label}</strong>
        <small>{help}</small>
      </div>
      <div className="finance-preference-control">{children}</div>
    </div>
  );
}
