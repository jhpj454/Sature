import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
};

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No records." }: DataTableProps<T>) {
  return (
    <div
      className="overflow-x-auto rounded-2xl border border-white/50 bg-white/45 backdrop-blur-xl"
      style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
    >
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200/30">
            {columns.map((column) => (
              <th
                className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${column.className ?? ""}`}
                key={column.key}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-slate-200/20 transition-colors hover:bg-white/30" key={rowKey(row)}>
              {columns.map((column) => (
                <td className={`px-4 py-2.5 align-top text-slate-600 ${column.className ?? ""}`} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-400" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
