import { create } from "@bufbuild/protobuf";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  type Transaction,
  TransactionSchema,
  TransactionType,
} from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import {
  dateString,
  parseDate,
} from "../../../../packages/domain/src/finance.ts";
import {
  decimalAmount,
  money,
  parseAmount,
} from "../../../../packages/domain/src/money.ts";
import {
  categoryName,
  saveMessage,
  useRefresh,
  useResources,
  useSettings,
} from "../shared/api.ts";
import { App as AntApp, Form } from "../shared/design-system.tsx";
import { Field, FormActions, FormFields } from "../shared/forms.tsx";
import { ErrorNotice } from "../shared/ui.tsx";
type Values = {
  date: string;
  type: string;
  categoryId: string;
  amount: string;
  counterparty: string;
  note: string;
  includeInBudget: boolean;
};
export function TransactionForm({
  transaction,
  onSaved,
  onCancel,
}: {
  transaction?: Transaction;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const settings = useSettings().data;
  const categoryData = useResources("categories").data?.categories;
  const categories = useMemo(() => categoryData ?? [], [categoryData]);
  const refresh = useRefresh("transactions");
  const [error, setError] = useState<unknown>();
  const [idempotency, setIdempotency] = useState(() => crypto.randomUUID());
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings?.timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const form = useForm<Values>({
    defaultValues: {
      date: transaction ? dateString(transaction.date) : today,
      type: String(transaction?.type ?? TransactionType.EXPENSE),
      categoryId: transaction?.categoryId ?? "groceries",
      amount: transaction?.amount
        ? decimalAmount(
            transaction.amount.minorUnits,
            transaction.amount.currencyCode,
          )
        : "",
      counterparty: transaction?.counterparty ?? "",
      note: transaction?.note ?? "",
      includeInBudget: transaction?.includeInBudget ?? true,
    },
  });
  const selectedType = useWatch({ control: form.control, name: "type" });
  useEffect(() => {
    if (!categories.length) return;
    const current = categories.find(
      (c) => c.id === form.getValues("categoryId"),
    );
    if (!current || String(current.type) !== selectedType) {
      const next = categories.find(
        (c) => String(c.type) === selectedType && !c.archived,
      );
      form.setValue("categoryId", next?.id ?? "");
    }
  }, [categories, selectedType, form]);
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    try {
      const input = create(TransactionSchema, {
        ...create(TransactionSchema, transaction),
        date: parseDate(values.date),
        type: Number(values.type),
        categoryId:
          categories.find(
            (category) =>
              category.id === values.categoryId ||
              category.slug === values.categoryId,
          )?.id ?? values.categoryId,
        amount: money(
          parseAmount(values.amount, settings?.defaultCurrency ?? "EUR"),
          settings?.defaultCurrency ?? "EUR",
        ),
        counterparty: values.counterparty,
        note: values.note,
        includeInBudget: values.includeInBudget,
      });
      await saveMessage(
        transaction ? `transactions/${transaction.id}` : "transactions",
        TransactionSchema,
        input,
        transaction ? "PATCH" : "POST",
        { "idempotency-key": idempotency },
      );
      setIdempotency(crypto.randomUUID());
      refresh();
      void message.success(t("saved"));
      if (!transaction) {
        form.reset({ ...values, amount: "", counterparty: "", note: "" });
      }
      onSaved?.();
    } catch (e) {
      setError(e);
    }
  });
  return (
    <Form
      className="finance-transaction-form finance-standard-form"
      layout="vertical"
      onFinish={() => {
        void submit();
      }}
      aria-label={t(transaction ? "editTransaction" : "quickAdd")}
    >
      {error ? <ErrorNotice error={error} /> : null}
      <FormFields>
        <Field
          control={form.control}
          name="date"
          label="date"
          type="date"
          required
        />
        <Field
          control={form.control}
          name="type"
          label="type"
          options={[
            { value: "1", label: t("income") },
            { value: "2", label: t("expenses") },
          ]}
        />
        <Field
          control={form.control}
          name="categoryId"
          label="category"
          options={categories
            .filter(
              (c) =>
                String(c.type) === selectedType &&
                (!c.archived || c.id === transaction?.categoryId),
            )
            .sort((a, b) => a.position - b.position)
            .map((c) => ({ value: c.id, label: categoryName(c, t) }))}
          required
        />
        <Field
          control={form.control}
          name="amount"
          label="amount"
          type="decimal"
          required
        />
        <Field
          control={form.control}
          name="counterparty"
          label="counterparty"
        />
        <Field control={form.control} name="note" label="note" />
        <Field
          control={form.control}
          name="includeInBudget"
          label="includeInBudget"
          type="checkbox"
        />
      </FormFields>
      <FormActions
        submitId={
          transaction ? "transaction-form-save" : "transaction-form-create"
        }
        submitLabel={t(transaction ? "save" : "addTransaction")}
        submitting={form.formState.isSubmitting}
        onCancel={onCancel}
      />
    </Form>
  );
}
