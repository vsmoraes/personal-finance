import { Alert, Button, Empty, Flex, Spin, Typography } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      message={t(
        `errors.${error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "INVALID_INPUT"}`,
        { defaultValue: t("errors.INVALID_INPUT") },
      )}
    />
  );
}
export function Loading() {
  const { t } = useTranslation();
  return (
    <Flex
      justify="center"
      align="center"
      gap="middle"
      style={{ padding: 48 }}
      role="status"
    >
      <Spin />
      <Typography.Text>{t("loading")}</Typography.Text>
    </Flex>
  );
}
export function EmptyState() {
  const { t } = useTranslation();
  return <Empty description={t("empty")} />;
}
export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <Flex
      justify="space-between"
      align="center"
      gap="middle"
      wrap
      style={{ marginBottom: 24 }}
    >
      <Flex vertical gap="small">
        <Typography.Title level={2} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            {subtitle}
          </Typography.Paragraph>
        )}
      </Flex>
      <Flex gap="small" align="center" wrap>
        {actions}
      </Flex>
    </Flex>
  );
}
export function Retry({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <Button onClick={onClick}>{t("retry")}</Button>;
}
