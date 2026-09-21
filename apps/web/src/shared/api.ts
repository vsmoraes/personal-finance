import {
  type DescMessage,
  fromJson,
  type JsonValue,
  type MessageShape,
  toJson,
} from "@bufbuild/protobuf";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type Category,
  FinanceResponseSchema,
  SettingsSchema,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function request(
  path: string,
  method = "GET",
  body?: JsonValue,
  headers: Record<string, string> = {},
): Promise<JsonValue> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR");
  }
  if (response.status === 204) return null;
  const data: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof data === "object" &&
      data !== null &&
      "code" in data &&
      typeof data.code === "string"
        ? data.code
        : "INTERNAL_ERROR",
    );
  return data as JsonValue;
}
export async function getMessage<D extends DescMessage>(
  path: string,
  schema: D,
): Promise<MessageShape<D>> {
  return fromJson(schema, await request(path));
}
export async function saveMessage<D extends DescMessage>(
  path: string,
  schema: D,
  message: MessageShape<D>,
  method = "POST",
  headers: Record<string, string> = {},
): Promise<MessageShape<D>> {
  return fromJson(
    schema,
    await request(path, method, toJson(schema, message), headers),
  );
}
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => getMessage("settings", SettingsSchema),
  });
}
export function useResources(path: string) {
  return useQuery({
    queryKey: [path],
    queryFn: () => getMessage(path, FinanceResponseSchema),
  });
}
export function useRefresh(queryKey?: string) {
  const client = useQueryClient();
  return () => {
    // Refresh only the resource changed by the mutation, in the background.
    // Mutations should not block on refetching every active query.
    setTimeout(
      () =>
        void client.invalidateQueries(
          queryKey ? { queryKey: [queryKey] } : undefined,
        ),
      0,
    );
  };
}
export function categoryName(
  category: Category | undefined,
  t: (key: string) => string,
): string {
  return category
    ? category.builtin
      ? t(`categories.${category.slug}`)
      : category.name
    : t("unknown");
}
