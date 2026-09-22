import { Alert } from "antd";
import { useTranslation } from "react-i18next";

export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "INVALID_INPUT";
  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      message={t(`errors.${code}`, { defaultValue: t("errors.INVALID_INPUT") })}
    />
  );
}
