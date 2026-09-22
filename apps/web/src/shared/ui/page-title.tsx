import { Flex, Typography } from "antd";
import type { ReactNode } from "react";

export interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageTitle({ title, subtitle, actions }: PageTitleProps) {
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
