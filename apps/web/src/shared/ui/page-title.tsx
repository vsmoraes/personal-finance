import { Flex } from "antd";
import type { ReactNode } from "react";

export interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageTitle({ actions }: PageTitleProps) {
  if (!actions) return null;
  return (
    <Flex
      className="page-title"
      justify="space-between"
      align="center"
      gap="middle"
      wrap
      style={{ marginBottom: 24 }}
    >
      <Flex className="page-title-actions" gap="small" align="center" wrap>
        {actions}
      </Flex>
    </Flex>
  );
}
