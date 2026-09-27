import { useTranslation } from "react-i18next";

import { Flex, Spin, Typography } from "../design-system.tsx";

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
