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
    <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/75 shadow-sm backdrop-blur-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-white/40">
          <tr className="border-b border-zinc-200/50">
            {columns.map((column) => (
              <th
                className={`px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 ${column.className ?? ""}`}
                key={column.key}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-zinc-200/40 transition-colors hover:bg-white/40" key={rowKey(row)}>
              {columns.map((column) => (
                <td className={`px-3 py-2 align-top ${column.className ?? ""}`} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-zinc-400" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
