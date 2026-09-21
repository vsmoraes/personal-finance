# Demo import fixtures

After `corepack pnpm seed:demo`, open **Import data** and upload `import.csv`.
Use source **demo-2025-2026-import**, ISO dates (`yyyy-MM-dd`), dot decimals, EUR,
and automatic delimiter detection. Detect columns, review the mapping, then preview.
The first three rows match seeded external IDs and should be marked duplicates;
the fourth is a new expense. Confirmation imports only the new row. Importing the
same file again adds nothing. The demo grocery, transit, and income rules apply.

Upload `invalid.csv` with the same format to exercise invalid-date and invalid-amount
messages and download the row-error report. Invalid rows cannot be confirmed.

All names and financial values are synthetic.
