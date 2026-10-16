import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../shared/cn';

export const PAGE_SIZES = [10, 25, 50, 100];

interface Props {
  page: number; // เริ่มที่ 1
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

/** เลขหน้าแบบย่อ: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

const btn =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40';

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label="เปลี่ยนหน้า" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
      <div className="flex items-center gap-3">
        <span className="num">
          แสดง <span className="font-medium text-fg">{from.toLocaleString('th-TH')}–{to.toLocaleString('th-TH')}</span> จาก{' '}
          <span className="font-medium text-fg">{total.toLocaleString('th-TH')}</span>
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 max-sm:hidden">
            <span>ต่อหน้า</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-border bg-surface px-2 text-[13px] text-fg focus:border-primary focus:outline-none"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={cn(btn, 'hover:bg-surface-2 hover:text-fg')} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="หน้าก่อนหน้า">
            <ChevronLeft className="size-4" />
          </button>
          {/* มือถือ: แสดงแค่ "หน้า x / y" */}
          <span className="num px-2 sm:hidden">
            หน้า {page} / {pages}
          </span>
          <span className="flex items-center gap-1 max-sm:hidden">
            {pageList(page, pages).map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => onPageChange(p)}
                  className={cn(btn, 'num', p === page ? 'bg-primary font-semibold text-primary-fg' : 'hover:bg-surface-2 hover:text-fg')}
                >
                  {p}
                </button>
              ),
            )}
          </span>
          <button type="button" className={cn(btn, 'hover:bg-surface-2 hover:text-fg')} disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="หน้าถัดไป">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </nav>
  );
}
