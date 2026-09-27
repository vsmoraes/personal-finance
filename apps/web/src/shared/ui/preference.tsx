import type { ReactNode } from "react";

import { Typography } from "../design-system.tsx";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <Typography.Paragraph type="secondary">
        {description}
      </Typography.Paragraph>
      <div className="finance-preference-card">{children}</div>
    </section>
  );
}

export function Preference({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="finance-preference-row">
      <div>
        <strong>{label}</strong>
        {help && <small>{help}</small>}
      </div>
      <div className="finance-preference-control">{children}</div>
    </div>
  );
}
