interface ExportColumn {
  header: string;
  key: string;
  render?: (value: unknown, row: Record<string, unknown>) => string | number;
}

interface ExportOptions {
  /** Rows written above the header — used to stamp the search criteria and
   *  totals onto the file so an exported report explains itself once it has
   *  been detached from the screen it came from. */
  preamble?: (string | number)[][];
}

export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  options: ExportOptions = {},
) {
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = columns.map((c) => escape(c.header)).join(",");
  const dataRows = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key];
        const val = c.render ? c.render(raw, row) : raw;
        return escape(val);
      })
      .join(","),
  );

  const preambleRows = (options.preamble ?? []).map((cells) =>
    cells.map((cell) => escape(cell)).join(","),
  );
  const csv = [...preambleRows, header, ...dataRows].join("\n");
  // Leading BOM: without it Excel reads the file as ANSI and Thai text arrives
  // as mojibake, which is the whole reason this file is Excel-openable at all.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
