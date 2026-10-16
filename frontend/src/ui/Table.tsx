import type { ReactNode } from 'react';
import { cn } from '../shared/cn';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** ซ่อนบนจอเล็ก */
  hideOnMobile?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}

const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function Table<T>({ columns, rows, rowKey, onRowClick, loading, empty, rowClassName }: Props<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-2/60">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted', alignCls[c.align ?? 'left'], c.hideOnMobile && 'max-md:hidden', c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3.5', c.hideOnMobile && 'max-md:hidden')}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn(
                    'border-b border-border transition-colors last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-surface-2/70',
                    rowClassName?.(r),
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle', alignCls[c.align ?? 'left'], c.hideOnMobile && 'max-md:hidden', c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows?.length === 0 && empty}
    </div>
  );
}
