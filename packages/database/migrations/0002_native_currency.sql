-- Original amounts, currencies, IDs, versions and deduplication keys remain unchanged.
UPDATE transactions SET payload = json_remove(payload, '$.baseAmount', '$.exchangeRate');
ALTER TABLE transactions DROP COLUMN base_amount;
UPDATE recurring_commitments SET payload = json_remove(payload, '$.exchangeRate');
UPDATE application_settings SET payload = json_remove(
  json_set(payload, '$.defaultCurrency', coalesce(json_extract(payload, '$.baseCurrency'), 'EUR')),
  '$.baseCurrency'
);
-- Keep retired manual rates as an archive; no runtime code reads or writes this table.
ALTER TABLE exchange_rates RENAME TO legacy_exchange_rates;
UPDATE idempotency_keys SET payload = json_remove(payload, '$.baseAmount', '$.exchangeRate')
WHERE id LIKE 'transaction:%' AND json_valid(payload);
UPDATE import_rows SET payload = json_remove(payload, '$.transaction.baseAmount', '$.transaction.exchangeRate');
UPDATE imports SET payload = json_set(payload, '$.rows', json(coalesce((
  SELECT json_group_array(json_remove(value, '$.transaction.baseAmount', '$.transaction.exchangeRate'))
  FROM json_each(imports.payload, '$.rows')
), '[]'))), request = json_remove(request, '$.exchangeRate', '$.columns.exchangeRate');
