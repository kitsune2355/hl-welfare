import { useState, type ReactNode } from 'react';
import { cn } from '../shared/cn';
import { Pagination } from './Pagination';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** ซ่อนบนจอเล็ก (ทั้งในตารางและการ์ดมือถือ) */
  hideOnMobile?: boolean;
  /**
   * ตำแหน่งในการ์ดมือถือ (ค่าเริ่มต้น: คอลัมน์แรก = title, header ไม่ใช่ข้อความ = lead,
   * header ว่าง = footer, ที่เหลือ = field)
   */
  mobile?: 'lead' | 'title' | 'aside' | 'field' | 'footer';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** เปิดแบ่งหน้า — จำนวนแถวต่อหน้าเริ่มต้น */
  pageSize?: number;
  /** ควบคุมเลขหน้าจากภายนอก (เช่นเก็บใน URL) */
  page?: number;
  onPageChange?: (page: number) => void;
  /** แสดงคอลัมน์เลขแถวแบบ Excel (ค่าเริ่มต้น: เปิด) */
  rowNumbers?: boolean;
}

const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' };
// สไตล์แบบ Excel: เส้นตาราง + หัวตารางติดด้านบน
const gridHead = 'sticky top-0 z-10 border-r border-b border-border bg-surface-2 px-3 py-2 text-xs font-semibold whitespace-nowrap text-muted last:border-r-0';
const gridCell = 'border-r border-b border-border last:border-r-0';

function slotOf<T>(c: Column<T>, i: number): NonNullable<Column<T>['mobile']> {
  if (c.mobile) return c.mobile;
  if (i === 0) return 'title';
  if (c.header === '' || c.header === null) return 'footer';
  if (typeof c.header !== 'string') return 'lead';
  return 'field';
}

export function Table<T>({ columns, rows, rowKey, onRowClick, loading, empty, rowClassName, pageSize, page: pageProp, onPageChange, rowNumbers = true }: Props<T>) {
  const [pageState, setPageState] = useState(1);
  const [size, setSize] = useState(pageSize ?? 0);

  const total = rows?.length ?? 0;
  const paged = !!pageSize && total > 0;
  const pages = paged ? Math.max(1, Math.ceil(total / size)) : 1;
  // ข้อมูลลดลง (เช่นกรอง/บันทึกแล้วแถวหาย) → ไม่ให้ค้างอยู่หน้าที่ไม่มีแล้ว
  const page = Math.min(pageProp ?? pageState, pages);
  const setPage = (p: number) => (onPageChange ? onPageChange(p) : setPageState(p));
  const visible = paged ? rows!.slice((page - 1) * size, page * size) : rows;

  const slots = columns.map((c, i) => ({ c, slot: slotOf(c, i) })).filter((x) => !x.c.hideOnMobile);
  const bySlot = (s: string) => slots.filter((x) => x.slot === s).map((x) => x.c);
  const label = (c: Column<T>) => (typeof c.header === 'string' ? c.header : '');

  const skeleton = loading && !rows;
  const isEmpty = !loading && rows?.length === 0;

  return (
    <div>
      {/* ===== Desktop / tablet: ตาราง ===== */}
      <div className="max-h-[70vh] overflow-auto max-md:hidden">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {rowNumbers && <th scope="col" className={cn(gridHead, 'w-12 text-center')}>#</th>}
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn(gridHead, alignCls[c.align ?? 'left'], c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skeleton
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    {rowNumbers && <td className={gridCell} />}
                    {columns.map((c) => (
                      <td key={c.key} className={cn(gridCell, 'px-3 py-3')}>
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible?.map((r, i) => (
                  <tr
                    key={rowKey(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn('transition-colors [&>td]:bg-surface', onRowClick && 'cursor-pointer hover:[&>td]:bg-primary-soft/40', rowClassName?.(r))}
                  >
                    {rowNumbers && <td className={cn(gridCell, 'num !bg-surface-2/70 text-center text-xs text-muted')}>{(paged ? (page - 1) * size : 0) + i + 1}</td>}
                    {columns.map((c) => (
                      <td key={c.key} className={cn(gridCell, 'px-3 py-2 align-middle', alignCls[c.align ?? 'left'], c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* ===== Mobile: การ์ดรายแถว ===== */}
      <ul className="divide-y divide-border md:hidden">
        {skeleton
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2.5 p-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
              </li>
            ))
          : visible?.map((r) => (
              <li
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('space-y-3 p-4', onRowClick && 'cursor-pointer active:bg-surface-2', rowClassName?.(r))}
              >
                <div className="flex items-center gap-3">
                  {bySlot('lead').map((c) => (
                    <span key={c.key}>{c.cell(r)}</span>
                  ))}
                  <div className="min-w-0 flex-1">
                    {bySlot('title').map((c) => (
                      <div key={c.key}>{c.cell(r)}</div>
                    ))}
                  </div>
                  {bySlot('aside').map((c) => (
                    <div key={c.key} className="shrink-0">
                      {c.cell(r)}
                    </div>
                  ))}
                </div>
                {bySlot('field').length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                    {bySlot('field').map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-xs text-muted">{label(c)}</dt>
                        <dd className="mt-0.5 min-w-0 break-words">{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {bySlot('footer').map((c) => (
                  <div key={c.key} className="[&>*]:justify-start">
                    {c.cell(r)}
                  </div>
                ))}
              </li>
            ))}
      </ul>

      {isEmpty && empty}

      {paged && (
        <Pagination
          page={page}
          pageSize={size}
          total={total}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(s) => {
            setSize(s);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
