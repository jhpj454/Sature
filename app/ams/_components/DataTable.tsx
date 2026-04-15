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
    <div className="overflow-x-auto rounded-lg border border-white/50 dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] backdrop-blur-xl dark:backdrop-blur-none">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200/30 dark:border-white/[0.08]">
            {columns.map((column) => (
              <th
                className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#9da5b4] ${column.className ?? ""}`}
                key={column.key}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-slate-200/20 dark:border-white/[0.06] transition-colors hover:bg-white/30 dark:hover:bg-white/[0.06]" key={rowKey(row)}>
              {columns.map((column) => (
                <td className={`px-4 py-2.5 align-top text-slate-600 dark:text-[#9da5b4] ${column.className ?? ""}`} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-400 dark:text-[#9da5b4]" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
