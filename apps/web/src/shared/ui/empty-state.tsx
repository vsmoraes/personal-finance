import { useTranslation } from "react-i18next";

import { Empty } from "../design-system.tsx";

export function EmptyState() {
  const { t } = useTranslation();
  return <Empty description={t("empty")} />;
}
