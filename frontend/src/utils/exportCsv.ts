interface ExportColumn {
  header: string;
  key: string;
  render?: (value: unknown, row: Record<string, unknown>) => string | number;
}

export function exportToCsv(filename: string, rows: Record<string, unknown>[], columns: ExportColumn[]) {
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

  const csv = [header, ...dataRows].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
