import { InboxOutlined } from "@ant-design/icons";
import { create, fromJson, toJson } from "@bufbuild/protobuf";
import {
  Button,
  Card,
  Flex,
  Form,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  ImportRequestSchema,
  type ImportResponse,
  ImportResponseSchema,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { request, useRefresh, useSettings } from "../shared/api.ts";
import { currencies, Field, FormFields } from "../shared/forms.tsx";
import { ErrorNotice, PageTitle } from "../shared/ui.tsx";
export function Imports() {
  const { t } = useTranslation();
  const settings = useSettings().data;
  const refresh = useRefresh();
  const [preview, setPreview] = useState<ImportResponse>();
  const [file, setFile] = useState<{ name: string; content: string }>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewInput, setPreviewInput] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const form = useForm({
    defaultValues: {
      source: "",
      dateFormat: settings?.importDateFormat ?? "yyyy-MM-dd",
      decimalSeparator: settings?.importDecimalSeparator ?? ".",
      defaultCurrency: settings?.importCurrency ?? "EUR",
      delimiter: "",
    },
  });
  form.watch();
  async function readFile(selected: File | undefined) {
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.size > 2_000_000) throw new Error("INVALID_FILE");
      const bytes = new Uint8Array(await selected.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      setFile({ name: selected.name, content: btoa(binary) });
      setPreview(undefined);
      setMapping({});
      setError(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    if (!file) return;
    setBusy(true);
    try {
      const response = fromJson(
        ImportResponseSchema,
        await request("imports", "POST", toImportJson()),
      );
      setPreview(response);
      setPreviewInput(JSON.stringify(toImportJson()));
      if (!Object.keys(mapping).length)
        setMapping(
          Object.fromEntries(
            [
              "date",
              "amount",
              "currency",
              "type",
              "category",
              "counterparty",
              "note",
              "externalId",
            ]
              .filter((key) => response.headers.includes(key))
              .map((key) => [key, key]),
          ),
        );
      setError(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function toImportJson() {
    const values = form.getValues();
    return toJson(
      ImportRequestSchema,
      create(ImportRequestSchema, {
        ...values,
        filename: file?.name ?? "",
        contentBase64: file?.content ?? "",
        columns: mapping,
      }),
    );
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      setPreview(
        fromJson(
          ImportResponseSchema,
          await request(
            `imports/${preview.id}/confirm`,
            "POST",
            {},
            { "idempotency-key": preview.id },
          ),
        ),
      );
      await refresh();
      setError(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title={t("imports")} subtitle={t("importsDescription")} />
      <Steps
        size="small"
        responsive
        current={
          preview?.status === "confirmed"
            ? 3
            : preview?.rows.length
              ? 2
              : file
                ? 1
                : 0
        }
        items={["upload", "mapColumns", "preview", "confirm"].map((key) => ({
          title: t(key),
        }))}
      />
      <Card style={{ marginTop: 24 }}>
        <Form.Item extra={t("uploadHelp")}>
          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            beforeUpload={(selected) => {
              void readFile(selected);
              return false;
            }}
            fileList={
              file ? [{ uid: file.name, name: file.name, status: "done" }] : []
            }
            onRemove={() => {
              setFile(undefined);
              setPreview(undefined);
              setMapping({});
            }}
          >
            <Spin spinning={busy}>
              <Space direction="vertical" align="center" size="middle">
                <InboxOutlined aria-hidden style={{ fontSize: 32 }} />
                <Typography.Text strong>{t("uploadCsv")}</Typography.Text>
              </Space>
            </Spin>
          </Upload.Dragger>
        </Form.Item>
        <Form
          layout="vertical"
          onFinish={() => {
            void inspect();
          }}
        >
          <FormFields>
            <Field
              control={form.control}
              name="source"
              label="importSource"
              required
            />
            <Field
              control={form.control}
              name="dateFormat"
              label="dateFormat"
              options={["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].map(
                (value) => ({ value, label: value }),
              )}
            />
            <Field
              control={form.control}
              name="decimalSeparator"
              label="decimalSeparator"
              options={[
                { value: ".", label: t("decimalDot") },
                { value: ",", label: t("decimalComma") },
              ]}
            />
            <Field
              control={form.control}
              name="defaultCurrency"
              label="defaultCurrency"
              options={currencies}
            />
            <Field
              control={form.control}
              name="delimiter"
              label="delimiter"
              options={[
                { value: "", label: t("automatic") },
                { value: ",", label: t("comma") },
                { value: ";", label: t("semicolon") },
                { value: "\t", label: t("tab") },
              ]}
            />
            <Button htmlType="submit" disabled={!file} loading={busy}>
              {t(preview ? "preview" : "detectColumns")}
            </Button>
          </FormFields>
        </Form>
      </Card>
      {error ? <ErrorNotice error={error} /> : null}
      {preview && (
        <Card style={{ marginTop: 24 }} title={t("mapColumns")}>
          <Typography.Paragraph>
            {t("encoding")}: {preview.encoding}
          </Typography.Paragraph>
          <Flex vertical gap="middle">
            {[
              "date",
              "amount",
              "currency",
              "type",
              "category",
              "counterparty",
              "note",
              "externalId",
            ].map((key) => (
              <Form.Item key={key} label={t(key)} htmlFor={`map-${key}`}>
                <Select
                  id={`map-${key}`}
                  value={mapping[key] ?? ""}
                  onChange={(value) =>
                    setMapping((old) => ({ ...old, [key]: value }))
                  }
                  options={[
                    { value: "", label: t("unmapped") },
                    ...preview.headers.map((value) => ({
                      value,
                      label: value,
                    })),
                  ]}
                />
              </Form.Item>
            ))}
          </Flex>
          <Typography.Paragraph>{t("importSignedHelp")}</Typography.Paragraph>
        </Card>
      )}
      {preview && preview.rows.length > 0 && (
        <Card style={{ marginTop: 24 }} title={t("preview")}>
          <Typography.Paragraph>
            {t("importSummary", {
              count: preview.rows.length,
              duplicates: preview.duplicates,
              imported: preview.imported,
            })}
          </Typography.Paragraph>
          <Table
            rowKey="rowNumber"
            size="small"
            scroll={{ x: 500, y: 350 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            dataSource={preview.rows}
            columns={[
              { title: t("row"), dataIndex: "rowNumber", width: 70 },
              {
                title: t("counterparty"),
                key: "counterparty",
                render: (_, row) => row.transaction?.counterparty,
              },
              {
                title: t("currency"),
                key: "currency",
                render: (_, row) => row.transaction?.amount?.currencyCode,
              },
              {
                title: t("status"),
                key: "status",
                render: (_, row) => (
                  <Flex wrap gap="small">
                    {row.duplicate && <Tag>{t("duplicate")}</Tag>}
                    {row.errors.length
                      ? row.errors.map((code, index) => (
                          <Tag color="error" key={index}>
                            {t(`errors.${code}`, {
                              defaultValue: t("errors.INVALID_INPUT"),
                            })}
                          </Tag>
                        ))
                      : !row.duplicate && (
                          <Tag color="success">{t("ready")}</Tag>
                        )}
                  </Flex>
                ),
              },
            ]}
          />
          <Flex gap="small" wrap>
            <Button href={`/api/v1/imports/${preview.id}/errors`}>
              {t("downloadErrors")}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={
                busy ||
                preview.status === "confirmed" ||
                previewInput !== JSON.stringify(toImportJson()) ||
                preview.rows.some((r) => r.errors.length > 0)
              }
              onClick={() => {
                void confirm();
              }}
            >
              {t(
                preview.status === "confirmed"
                  ? "importComplete"
                  : "confirmImport",
              )}
            </Button>
          </Flex>
        </Card>
      )}
    </>
  );
}
