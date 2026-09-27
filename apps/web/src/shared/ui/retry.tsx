import { useTranslation } from "react-i18next";

import { Button } from "../design-system.tsx";

export function Retry({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <Button onClick={onClick}>{t("retry")}</Button>;
}
