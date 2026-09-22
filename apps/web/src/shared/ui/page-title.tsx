import { Flex } from "antd";
import type { ReactNode } from "react";

export interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageTitle({ title, subtitle, actions }: PageTitleProps) {
  return (
    <section className="finance-page-head">
      <div>
        {subtitle && <div className="finance-eyebrow">{subtitle}</div>}
        <h1>{title}</h1>
      </div>
      {actions && (
        <Flex className="page-title-actions" gap="small" align="center" wrap>
          {actions}
        </Flex>
      )}
    </section>
  );
}
