import {
  ColorPicker,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
} from "antd";
import dayjs from "dayjs";
import { type ReactNode } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
  type RegisterOptions,
} from "react-hook-form";
import { useTranslation } from "react-i18next";

import { categoryIcons } from "./category-icons.tsx";

export type Option = { value: string; label: string };

/** Keep React Hook Form as the state owner; Ant Design owns presentation. */
export function FormFields({ children }: { children: ReactNode }) {
  return (
    <div className="finance-form-surface finance-form-fields">{children}</div>
  );
}

export function FormField({
  label,
  help,
  required = false,
  children,
}: {
  label?: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Form.Item
      className="finance-form-field"
      {...(label ? { label: t(label), htmlFor: label, required } : {})}
      {...(help ? { extra: help } : {})}
    >
      {children}
    </Form.Item>
  );
}

export function Field<T extends FieldValues>({
  name,
  label,
  control,
  type = "text",
  options,
  required = false,
  presentation = "field",
}: {
  name: Path<T>;
  label: string;
  control: Control<T>;
  type?: string;
  options?: Option[];
  required?: boolean;
  /** Use when an enclosing preference row already owns the label and help text. */
  presentation?: "field" | "control";
}) {
  const { t } = useTranslation();
  const rules: RegisterOptions<T, Path<T>> = {
    required: required ? t("required") : false,
  };
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field, fieldState }) => (
        <Form.Item
          className={`finance-form-field ${type === "checkbox" ? "finance-toggle-field" : ""} ${presentation === "control" ? "finance-form-control" : ""}`}
          {...(presentation === "control"
            ? {}
            : { label: t(label), htmlFor: name, required })}
          validateStatus={fieldState.error ? "error" : ""}
          help={fieldState.error?.message}
        >
          {type === "checkbox" ? (
            <Switch
              id={name}
              checked={Boolean(field.value)}
              onChange={field.onChange}
            />
          ) : type === "icon" ? (
            <Select
              {...field}
              id={name}
              aria-label={t(label)}
              options={categoryIcons.map((icon) => ({
                value: icon.value,
                label: t(icon.label),
                icon: icon.icon,
              }))}
              optionRender={(option) => (
                <>
                  {option.data.icon} {option.label}
                </>
              )}
            />
          ) : options ? (
            <Select
              {...field}
              id={name}
              aria-label={t(label)}
              options={options}
              showSearch
              optionFilterProp="label"
            />
          ) : type === "date" || type === "month" ? (
            <DatePicker
              id={name}
              aria-label={t(label)}
              picker={type === "month" ? "month" : "date"}
              format={type === "month" ? "YYYY-MM" : "YYYY-MM-DD"}
              style={{ width: "100%" }}
              value={field.value ? dayjs(String(field.value)) : null}
              onChange={(value) =>
                field.onChange(
                  value
                    ? value.format(type === "month" ? "YYYY-MM" : "YYYY-MM-DD")
                    : "",
                )
              }
              onBlur={field.onBlur}
            />
          ) : type === "color" ? (
            <ColorPicker
              value={String(field.value)}
              onChange={(value) => field.onChange(value.toHexString())}
              showText
            />
          ) : type === "number" ? (
            <InputNumber
              id={name}
              aria-label={t(label)}
              stringMode
              value={String(field.value)}
              onChange={(value) => field.onChange(value ?? "")}
              onBlur={field.onBlur}
              style={{ width: "100%" }}
            />
          ) : (
            <Input
              {...field}
              id={name}
              type="text"
              inputMode={type === "decimal" ? "decimal" : undefined}
              aria-invalid={Boolean(fieldState.error)}
              autoComplete="off"
            />
          )}
        </Form.Item>
      )}
    />
  );
}
export const currencies = Intl.supportedValuesOf("currency").map((value) => ({
  value,
  label: value,
}));
