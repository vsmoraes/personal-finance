import { Button } from "antd";
import { useTranslation } from "react-i18next";

export function Retry({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <Button onClick={onClick}>{t("retry")}</Button>;
}
