import {
  Checkbox,
  Col,
  ColorPicker,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
} from "antd";
import dayjs from "dayjs";
import { Children, isValidElement, type ReactNode } from "react";
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
    <Row gutter={[16, 0]}>
      {Children.map(
        children,
        (child) =>
          child && (
            <Col
              span={24}
              sm={isValidElement(child) && child.type === Field ? 12 : 24}
            >
              {child}
            </Col>
          ),
      )}
    </Row>
  );
}

export function Field<T extends FieldValues>({
  name,
  label,
  control,
  type = "text",
  options,
  required = false,
}: {
  name: Path<T>;
  label: string;
  control: Control<T>;
  type?: string;
  options?: Option[];
  required?: boolean;
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
          label={type === "checkbox" ? undefined : t(label)}
          htmlFor={name}
          required={required}
          validateStatus={fieldState.error ? "error" : ""}
          help={fieldState.error?.message}
        >
          {type === "checkbox" ? (
            <Checkbox
              id={name}
              checked={Boolean(field.value)}
              onChange={(event) => field.onChange(event.target.checked)}
              onBlur={field.onBlur}
            >
              {t(label)}
            </Checkbox>
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
