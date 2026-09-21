import { readFileSync, writeFileSync } from "node:fs";

import {
  type DescField,
  type DescMessage,
  type JsonObject,
  type JsonValue,
  ScalarType,
} from "@bufbuild/protobuf";
import { format } from "prettier";
import ts from "typescript";

import { file_finance_v1_finance } from "../packages/contracts/src/finance/v1/finance_pb.js";
const reference = (name: string) => ({
  $ref: `#/components/schemas/${name.replace("finance.v1.", "")}`,
});
function scalar(type: ScalarType): JsonObject {
  if (
    [
      ScalarType.INT64,
      ScalarType.UINT64,
      ScalarType.SINT64,
      ScalarType.FIXED64,
      ScalarType.SFIXED64,
    ].includes(type)
  )
    return {
      type: "string",
      pattern: "^-?[0-9]+$",
      description: "Exact integer, serialized as a decimal string.",
    };
  return {
    type:
      type === ScalarType.STRING
        ? "string"
        : type === ScalarType.BOOL
          ? "boolean"
          : type === ScalarType.BYTES
            ? "string"
            : "integer",
  };
}
function property(field: DescField): JsonObject {
  switch (field.fieldKind) {
    case "scalar":
      return scalar(field.scalar);
    case "enum":
      return { type: "string", enum: field.enum.values.map((v) => v.name) };
    case "message":
      return reference(field.message.typeName);
    case "list":
      return {
        type: "array",
        items:
          field.listKind === "message"
            ? reference(field.message.typeName)
            : field.listKind === "enum"
              ? { type: "string", enum: field.enum.values.map((v) => v.name) }
              : scalar(field.scalar),
      };
    case "map":
      return {
        type: "object",
        additionalProperties:
          field.mapKind === "message"
            ? reference(field.message.typeName)
            : field.mapKind === "enum"
              ? { type: "string" }
              : scalar(field.scalar),
      };
  }
}
function message(schema: DescMessage): JsonObject {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      schema.fields.map((field) => [
        field.jsonName,
        {
          ...property(field),
          ...(field.proto.options?.deprecated
            ? {
                deprecated: true,
                description:
                  "Legacy field retained for wire compatibility; ignored by the application.",
              }
            : {}),
        },
      ]),
    ),
  };
}
const source = ts.createSourceFile(
  "routes.ts",
  readFileSync("apps/api/src/adapters/http/routes.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const paths: Record<string, JsonValue> = {};
function add(path: string, method: string, handler: string) {
  const response = /toJson\(\s*p\.(\w+)Schema/.exec(handler)?.[1];
  const body = /decode\(\s*p\.(\w+)Schema,\s*request.body/.exec(handler)?.[1];
  const status =
    method === "delete"
      ? "204"
      : method === "post" &&
          !path.endsWith("/confirm") &&
          !path.endsWith("/preview") &&
          !path.endsWith("/bulk") &&
          !path.endsWith("/copy")
        ? "201"
        : "200";
  const operation: JsonObject = {
    operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`,
    responses: {
      [status]: {
        description: "Successful operation",
        ...(response
          ? { content: { "application/json": { schema: reference(response) } } }
          : {}),
      },
      default: {
        description: "Structured application error",
        content: {
          "application/problem+json": { schema: reference("Problem") },
        },
      },
    },
  };
  const parameters: JsonValue[] = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1] ?? "",
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  if (method === "delete")
    parameters.push({
      name: "If-Match",
      in: "header",
      required: true,
      schema: { type: "string" },
      description: "Current optimistic concurrency version.",
    });
  if (
    method === "post" &&
    (path === "/api/v1/transactions" || path.endsWith("/confirm"))
  )
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string" },
    });
  if (path.startsWith("/api/v1/reports/"))
    for (const field of file_finance_v1_finance.messages.find(
      (m) => m.name === "ReportRequest",
    )?.fields ?? [])
      parameters.push({
        name: field.jsonName,
        in: "query",
        schema: property(field),
      });
  if (method === "get" && path === "/api/v1/transactions")
    for (const field of file_finance_v1_finance.messages.find(
      (m) => m.name === "ListRequest",
    )?.fields ?? [])
      parameters.push({
        name: field.jsonName,
        in: "query",
        schema: property(field),
      });
  if (parameters.length) operation["parameters"] = parameters;
  if (body)
    operation["requestBody"] = {
      required: true,
      content: { "application/json": { schema: reference(body) } },
    };
  const previous = paths[path];
  paths[path] = {
    ...(typeof previous === "object" &&
    !Array.isArray(previous) &&
    previous !== null
      ? previous
      : {}),
    [method]: operation,
  };
}
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText(source) === "app" &&
    ["get", "post", "put", "patch", "delete"].includes(
      node.expression.name.text,
    )
  ) {
    const arg = node.arguments[0];
    const handler = node.arguments[1];
    if (arg && handler) {
      if (ts.isStringLiteral(arg))
        add(
          arg.text.replace(/:(\w+)/g, "{$1}"),
          node.expression.name.text,
          handler.getText(source),
        );
      else if (ts.isTemplateExpression(arg))
        for (const kind of ["dashboard", "monthly", "categories", "forecast"])
          add(`/api/v1/reports/${kind}`, "get", handler.getText(source));
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
const document = {
  openapi: "3.1.0",
  info: {
    title: "Personal Finance API",
    version: "1.0.0",
    description:
      "Generated from Protobuf descriptors and registered HTTP routes. Standard Protobuf JSON. Private-network single-profile deployment.",
  },
  paths,
  components: {
    schemas: Object.fromEntries(
      file_finance_v1_finance.messages.map((m) => [m.name, message(m)]),
    ),
  },
};
const output = await format(JSON.stringify(document), { parser: "json" });
if (process.argv.includes("--check")) {
  if (readFileSync("docs/openapi.json", "utf8") !== output)
    throw new Error("OpenAPI is stale. Run pnpm api:generate.");
} else writeFileSync("docs/openapi.json", output);
