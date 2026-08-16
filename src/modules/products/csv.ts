const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function rowsToCsv(
  rows: readonly (readonly (string | number | null)[])[],
): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}
