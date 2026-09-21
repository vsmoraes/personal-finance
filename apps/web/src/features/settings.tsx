import { create } from "@bufbuild/protobuf";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Flex,
  Form,
  Select,
  Tabs,
  Typography,
} from "antd";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  type Settings,
  SettingsSchema,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { saveMessage, useRefresh, useSettings } from "../shared/api.ts";
import { currencies, Field, FormFields } from "../shared/forms.tsx";
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
  const refresh = useRefresh();
  const { message } = AntApp.useApp();
  const [error, setError] = useState<unknown>();
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
      await refresh();
      void message.success(t("saved"));
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  });
  return (
    <Card>
      <Form
        layout="vertical"
        onFinish={() => {
          void submit();
        }}
      >
        <Flex vertical gap="large">
          {error ? <ErrorNotice error={error} /> : null}
          <Tabs
            items={[
              {
                key: "general",
                label: t("preferences"),
                children: (
                  <FormFields>
                    <Field
                      control={form.control}
                      name="language"
                      label="language"
                      options={[
                        { value: "en", label: "English" },
                        { value: "es", label: "Español" },
                        { value: "pt-BR", label: "Português (Brasil)" },
                      ]}
                    />
                    <Field
                      control={form.control}
                      name="defaultCurrency"
                      label="defaultCurrency"
                      options={currencies}
                    />
                    <Field
                      control={form.control}
                      name="timezone"
                      label="timezone"
                      options={[
                        "UTC",
                        ...Intl.supportedValuesOf("timeZone"),
                      ].map((value) => ({ value, label: value }))}
                    />
                  </FormFields>
                ),
              },
              {
                key: "theme",
                label: t("themeSettings"),
                children: (
                  <Flex vertical gap="middle">
                    <Form.Item label={t("theme")}>
                      <Select
                        value={form.watch("theme")}
                        onChange={(value) => form.setValue("theme", value)}
                        options={["light", "dark", "custom"].map((value) => ({
                          value,
                          label: t(value),
                        }))}
                      />
                    </Form.Item>
                    {form.watch("theme") === "custom" && (
                      <Card size="small" title={t("customColors")}>
                        <Typography.Paragraph type="secondary">
                          {t("customColorsHelp")}
                        </Typography.Paragraph>
                        <Form.Item label={t("customMode")}>
                          <Select
                            value={form.watch("customMode")}
                            onChange={(value) =>
                              form.setValue("customMode", value)
                            }
                            options={["light", "dark"].map((value) => ({
                              value,
                              label: t(value),
                            }))}
                          />
                        </Form.Item>
                        <FormFields>
                          <Field
                            control={form.control}
                            name="customBackground"
                            label="customBackground"
                            type="color"
                          />
                          <Field
                            control={form.control}
                            name="customSurface"
                            label="customSurface"
                            type="color"
                          />
                          <Field
                            control={form.control}
                            name="customAccent"
                            label="customAccent"
                            type="color"
                          />
                          <Field
                            control={form.control}
                            name="customAccentSecondary"
                            label="customAccentSecondary"
                            type="color"
                          />
                          <Field
                            control={form.control}
                            name="customSidebarAccent"
                            label="customSidebarAccent"
                            type="color"
                          />
                          <Field
                            control={form.control}
                            name="customSidebarAccentSecondary"
                            label="customSidebarAccentSecondary"
                            type="color"
                          />
                        </FormFields>
                      </Card>
                    )}
                  </Flex>
                ),
              },
              {
                key: "display",
                label: t("displayPreferences"),
                children: (
                  <FormFields>
                    <Field
                      control={form.control}
                      name="dateFormat"
                      label="dateFormat"
                      options={["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].map(
                        (value) => ({ value, label: value }),
                      )}
                    />
                    <Field
                      control={form.control}
                      name="reportYear"
                      label="reportYear"
                      type="number"
                    />
                    <Field
                      control={form.control}
                      name="firstDayOfWeek"
                      label="firstDayOfWeek"
                      options={Array.from({ length: 7 }, (_, i) => ({
                        value: String(i),
                        label: new Intl.DateTimeFormat(i18n.language, {
                          weekday: "long",
                          timeZone: "UTC",
                        }).format(new Date(Date.UTC(2024, 0, 7 + i))),
                      }))}
                    />
                  </FormFields>
                ),
              },
              {
                key: "imports",
                label: t("importDefaults"),
                children: (
                  <FormFields>
                    <Field
                      control={form.control}
                      name="importCurrency"
                      label="importCurrency"
                      options={currencies}
                    />
                    <Field
                      control={form.control}
                      name="importDateFormat"
                      label="importDateFormat"
                      options={["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].map(
                        (value) => ({ value, label: value }),
                      )}
                    />
                    <Field
                      control={form.control}
                      name="importDecimalSeparator"
                      label="importDecimalSeparator"
                      options={[
                        { value: ".", label: t("decimalDot") },
                        { value: ",", label: t("decimalComma") },
                      ]}
                    />
                  </FormFields>
                ),
              },
            ]}
          />
          <Alert
            role="note"
            type="info"
            showIcon
            message={t("defaultCurrencyHelp")}
          />
          <Flex justify="end">
            <Button
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
