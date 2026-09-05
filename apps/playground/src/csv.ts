import { BENCH_COLUMNS, type BenchRow } from '@gesture/protocol';

/**
 * Serialize bench rows to CSV. The header is exactly `BENCH_COLUMNS.join(',')`
 * so any consumer (0B fps logger, 0D dispatch survey) can reuse the tuple as
 * the schema. Cells are stringified in column order.
 */
export function benchToCsv(rows: BenchRow[]): string {
  const header = BENCH_COLUMNS.join(',');
  const body = rows.map((r) =>
    BENCH_COLUMNS.map((c) => csvCell((r as Record<string, unknown>)[c])).join(','),
  );
  return [header, ...body].join('\n');
}

function csvCell(value: unknown): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
