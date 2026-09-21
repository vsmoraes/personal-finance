import { parse } from "csv-parse/sync";

import type { ImportAdapter } from "../../../../../packages/application/src/ports.js";
import {
  assert,
  DomainError,
} from "../../../../../packages/domain/src/money.js";
export const csvAdapter: ImportAdapter = {
  decode(request) {
    assert(
      /^[A-Za-z0-9+/]*={0,2}$/.test(request.contentBase64),
      "INVALID_FILE",
    );
    const buffer = Buffer.from(request.contentBase64, "base64");
    assert(buffer.length > 0 && buffer.length <= 2_000_000, "INVALID_FILE");
    let encoding = "utf-8";
    if (buffer[0] === 255 && buffer[1] === 254) encoding = "utf-16le";
    else if (buffer[0] === 254 && buffer[1] === 255) encoding = "utf-16be";
    let text: string;
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
      encoding = "windows-1252";
      text = new TextDecoder(encoding).decode(buffer);
    }
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    const delimiter =
      request.delimiter ||
      [",", ";", "\t"].sort(
        (a, b) => firstLine.split(b).length - firstLine.split(a).length,
      )[0] ||
      ",";
    assert([",", ";", "\t"].includes(delimiter), "INVALID_DELIMITER");
    let raw: unknown;
    try {
      raw = parse(text, {
        delimiter,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        max_record_size: 20000,
      });
    } catch {
      throw new DomainError("INVALID_FILE");
    }
    assert(
      Array.isArray(raw) &&
        raw.every(
          (r: unknown) =>
            Array.isArray(r) && r.every((v: unknown) => typeof v === "string"),
        ),
      "INVALID_FILE",
    );
    // csv-parse returns unknown; each row and cell have been checked above.
    const records = raw;
    assert(records.length <= 10001, "IMPORT_TOO_LARGE");
    return { records, encoding, delimiter };
  },
};
