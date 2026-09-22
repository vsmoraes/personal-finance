import { Empty } from "antd";
import { useTranslation } from "react-i18next";

export function EmptyState() {
  const { t } = useTranslation();
  return <Empty description={t("empty")} />;
}
