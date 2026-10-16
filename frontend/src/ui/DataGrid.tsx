import { AlertTriangle, Check, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../shared/cn';
import { Button } from './Button';
import { Combobox, type ComboOption } from './Combobox';
import { Pagination } from './Pagination';
import { Skeleton } from './Skeleton';

export type CellEditor = 'text' | 'number' | 'date' | 'select' | 'switch';
export type CellValue = string | number | boolean | null;

export interface GridColumn<T> {
  key: string;
  header: string;
  /** ความกว้าง (px) */
  width: number;
  /** ไม่ระบุ = อ่านอย่างเดียว */
  editor?: CellEditor;
  value: (row: T) => CellValue;
  /** คืนแถวใหม่หลังแก้ค่า (immutable) */
  set?: (row: T, value: CellValue) => T;
  /** แสดงผลในเซลล์ (ค่าเริ่มต้น = value เป็นข้อความ) */
  display?: (row: T) => ReactNode;
  options?: (row: T) => ComboOption[];
  creatable?: boolean;
  /** แก้ได้เฉพาะบางแถว (เช่น ระดับ แก้ได้เฉพาะพนักงานส่วนกลาง) */
  editable?: (row: T) => boolean;
  align?: 'left' | 'right' | 'center';
  required?: boolean;
}

type RowStatus = { state: 'saving' } | { state: 'saved' } | { state: 'error'; message: string };

interface Props<T> {
  columns: GridColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  empty?: ReactNode;
  /** คืน error ราย column key — มี error จะยังไม่บันทึก */
  validate?: (row: T) => Partial<Record<string, string>>;
  /** บันทึก 1 แถว — parent ต้องอัปเดต rows เอง (เช่น setData) */
  onSave: (row: T, isNew: boolean) => Promise<unknown>;
  /** มีค่า = แสดงปุ่ม "เพิ่มแถว" */
  newRow?: () => T;
  addLabel?: string;
  onDelete?: (row: T) => void;
  onOpen?: (row: T) => void;
  pageSize?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  toolbar?: ReactNode;
}

interface Entry<T> {
  key: string;
  row: T;
  isNew: boolean;
}

const fmtValue = (v: CellValue) => (v === null || v === undefined || v === '' ? '' : String(v));

export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  validate,
  onSave,
  newRow,
  addLabel = 'เพิ่มแถว',
  onDelete,
  onOpen,
  pageSize,
  page: pageProp,
  onPageChange,
  toolbar,
}: Props<T>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drafts, setDrafts] = useState<Record<string, T>>({});
  const [newRows, setNewRows] = useState<{ key: string; row: T }[]>([]);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ initial: string } | null>(null);
  const [pageState, setPageState] = useState(1);
  const [size, setSize] = useState(pageSize ?? 0);
  const seq = useRef(0);
  /** Enter/Tab/Esc จัดการแล้ว → ไม่ต้อง commit ซ้ำตอน blur */
  const handled = useRef(false);

  // ----- แถวที่แสดง: แถวใหม่ (ยังไม่บันทึก) อยู่บนสุด -----
  const total = rows?.length ?? 0;
  const paged = !!pageSize && total > 0;
  const pages = paged ? Math.max(1, Math.ceil(total / size)) : 1;
  const page = Math.min(pageProp ?? pageState, pages);
  const setPage = (p: number) => {
    setActive(null);
    if (onPageChange) onPageChange(p);
    else setPageState(p);
  };
  const pageRows = paged ? rows!.slice((page - 1) * size, page * size) : (rows ?? []);
  const entries: Entry<T>[] = [
    ...newRows.map((n) => ({ key: n.key, row: n.row, isNew: true })),
    ...pageRows.map((r) => {
      const key = String(rowKey(r));
      return { key, row: drafts[key] ?? r, isNew: false };
    }),
  ];

  const errorsOf = (row: T) => validate?.(row) ?? {};
  const canEdit = (col: GridColumn<T>, row: T) => !!col.editor && !!col.set && (col.editable?.(row) ?? true);

  // ล้างสถานะ "บันทึกแล้ว" หลัง 2 วินาที
  useEffect(() => {
    const saved = Object.entries(status).filter(([, s]) => s.state === 'saved');
    if (!saved.length) return;
    const t = setTimeout(() => setStatus((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v.state !== 'saved'))), 2000);
    return () => clearTimeout(t);
  }, [status]);

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const save = async (entry: Entry<T>, next: T) => {
    const errs = errorsOf(next);
    if (Object.keys(errs).length) {
      if (!entry.isNew) setStatus((s) => ({ ...s, [entry.key]: { state: 'error', message: Object.values(errs).join(' · ') } }));
      return;
    }
    setStatus((s) => ({ ...s, [entry.key]: { state: 'saving' } }));
    try {
      await onSave(next, entry.isNew);
      if (entry.isNew) setNewRows((xs) => xs.filter((x) => x.key !== entry.key));
      else
        setDrafts((d) => {
          const { [entry.key]: _, ...rest } = d;
          return rest;
        });
      setStatus((s) => ({ ...s, [entry.key]: { state: 'saved' } }));
    } catch (e) {
      setStatus((s) => ({ ...s, [entry.key]: { state: 'error', message: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' } }));
    }
  };

  const commit = (r: number, c: number, raw: CellValue) => {
    const entry = entries[r];
    const col = columns[c];
    if (!entry || !col.set) return;
    if (fmtValue(col.value(entry.row)) === fmtValue(raw)) return;
    const value = col.editor === 'number' ? (raw === '' || raw === null ? null : Number(raw)) : raw;
    const next = col.set(entry.row, value);
    if (entry.isNew) setNewRows((xs) => xs.map((x) => (x.key === entry.key ? { ...x, row: next } : x)));
    else setDrafts((d) => ({ ...d, [entry.key]: next }));
    void save(entry, next);
  };

  const move = (dr: number, dc: number) =>
    setActive((a) => {
      if (!a) return { r: 0, c: 0 };
      return { r: Math.max(0, Math.min(entries.length - 1, a.r + dr)), c: Math.max(0, Math.min(columns.length - 1, a.c + dc)) };
    });

  const startEdit = (initial?: string) => {
    if (!active) return;
    const entry = entries[active.r];
    const col = columns[active.c];
    if (!entry || !canEdit(col, entry.row)) return;
    if (col.editor === 'switch') {
      commit(active.r, active.c, !col.value(entry.row));
      return;
    }
    handled.current = false;
    setEditing({ initial: initial ?? fmtValue(col.value(entry.row)) });
  };

  const endEdit = (dr = 0, dc = 0) => {
    setEditing(null);
    if (dr || dc) move(dr, dc);
    requestAnimationFrame(focusGrid);
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !active) return;
    const k = e.key;
    if (k === 'ArrowDown') move(1, 0);
    else if (k === 'ArrowUp') move(-1, 0);
    else if (k === 'ArrowRight') move(0, 1);
    else if (k === 'ArrowLeft') move(0, -1);
    else if (k === 'Tab') move(0, e.shiftKey ? -1 : 1);
    else if (k === 'Enter' || k === 'F2') startEdit();
    else if (k === ' ' && columns[active.c].editor === 'switch') startEdit();
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ed = columns[active.c].editor;
      if (ed === 'text' || ed === 'number') startEdit(k);
      else if (ed === 'select' || ed === 'date') startEdit();
      else return;
    } else return;
    e.preventDefault();
  };

  const addRow = () => {
    if (!newRow) return;
    const key = `new:${++seq.current}`;
    setNewRows((xs) => [{ key, row: newRow() }, ...xs]);
    setActive({ r: 0, c: 0 });
    focusGrid();
  };

  const discardNew = (key: string) => {
    setNewRows((xs) => xs.filter((x) => x.key !== key));
    setStatus((s) => {
      const { [key]: _, ...rest } = s;
      return rest;
    });
  };

  const unsaved = newRows.length + Object.keys(drafts).length;
  const errorCount = Object.values(status).filter((s) => s.state === 'error').length;

  // ----- editor ในเซลล์ -----
  const renderEditor = (entry: Entry<T>, col: GridColumn<T>, r: number, c: number) => {
    if (col.editor === 'select') {
      return (
        <Combobox
          variant="cell"
          autoOpen
          creatable={col.creatable}
          value={fmtValue(col.value(entry.row))}
          options={col.options?.(entry.row) ?? []}
          onChange={(v) => commit(r, c, v)}
          onClose={(committed) => endEdit(committed ? 1 : 0, 0)}
          aria-label={col.header}
          className="h-full"
        />
      );
    }
    const type = col.editor === 'number' ? 'number' : col.editor === 'date' ? 'date' : 'text';
    return (
      <input
        autoFocus
        type={type}
        defaultValue={editing?.initial}
        aria-label={col.header}
        onFocus={(e) => {
          if (type === 'text') e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handled.current = true;
            commit(r, c, e.currentTarget.value);
            endEdit(1, 0);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            handled.current = true;
            commit(r, c, e.currentTarget.value);
            endEdit(0, e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handled.current = true;
            endEdit();
          }
        }}
        onBlur={(e) => {
          if (handled.current) return;
          commit(r, c, e.currentTarget.value);
          setEditing(null);
        }}
        className={cn('num h-full w-full bg-surface px-2 text-[13px] focus:outline-none', col.align === 'right' && 'text-right')}
      />
    );
  };

  const statusIcon = (entry: Entry<T>) => {
    const s = status[entry.key];
    if (s?.state === 'saving') return <Loader2 className="size-3.5 animate-spin text-primary" aria-label="กำลังบันทึก" />;
    if (s?.state === 'saved') return <Check className="size-3.5 text-success" aria-label="บันทึกแล้ว" />;
    if (s?.state === 'error') return <AlertTriangle className="size-3.5 text-danger" aria-label={s.message} />;
    if (entry.isNew) return <span className="text-[10px] font-semibold text-primary">ใหม่</span>;
    return null;
  };

  const hasActions = !!onDelete || !!onOpen;
  const totalWidth = 52 + columns.reduce((s, c) => s + c.width, 0) + (hasActions ? 76 : 0);

  return (
    <div>
      {/* ----- Toolbar ----- */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        {newRow && (
          <Button size="sm" variant="primary" icon={<Plus />} onClick={addRow}>
            {addLabel}
          </Button>
        )}
        {toolbar}
        <p className="ml-auto text-xs text-muted max-md:hidden">
          ดับเบิลคลิก / Enter / พิมพ์ = แก้ไข · Tab, Enter = บันทึก · Esc = ยกเลิก · ←↑↓→ เลื่อนเซลล์
        </p>
        {(unsaved > 0 || errorCount > 0) && (
          <span className={cn('text-xs font-medium', errorCount ? 'text-danger' : 'text-warning')}>
            {errorCount ? `มีข้อผิดพลาด ${errorCount} แถว` : `ยังไม่บันทึก ${unsaved} แถว`}
          </span>
        )}
      </div>

      {/* ----- Grid ----- */}
      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={entries.length}
        onKeyDown={onGridKey}
        className="relative max-h-[70vh] overflow-auto focus:outline-none"
      >
        <table className="border-separate border-spacing-0 text-[13px]" style={{ width: totalWidth, minWidth: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 52 }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            {hasActions && <col style={{ width: 76 }} />}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 border-r border-b border-border bg-surface-2 text-xs font-medium text-muted">#</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-20 truncate border-r border-b border-border bg-surface-2 px-2 py-2 text-left text-xs font-semibold text-muted',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.header}
                  {c.required && <span className="ml-0.5 text-danger">*</span>}
                </th>
              ))}
              {hasActions && <th className="sticky top-0 right-0 z-30 border-b border-l border-border bg-surface-2" aria-label="การทำงาน" />}
            </tr>
          </thead>
          <tbody>
            {loading && !rows
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td className="border-r border-b border-border" />
                    {columns.map((c) => (
                      <td key={c.key} className="h-9 border-r border-b border-border px-2">
                        <Skeleton className="h-3.5 w-3/4" />
                      </td>
                    ))}
                    {hasActions && <td className="border-b border-border" />}
                  </tr>
                ))
              : entries.map((entry, r) => {
                  const errs = entry.isNew || status[entry.key]?.state === 'error' ? errorsOf(entry.row) : {};
                  const st = status[entry.key];
                  const rowBg = entry.isNew ? 'bg-primary-soft/40' : st?.state === 'error' ? 'bg-danger-soft/40' : 'bg-surface';
                  return (
                    <tr key={entry.key} className="group">
                      <td
                        className={cn('sticky left-0 z-10 border-r border-b border-border text-center text-xs text-muted', rowBg === 'bg-surface' ? 'bg-surface-2/70' : rowBg)}
                        title={st?.state === 'error' ? st.message : undefined}
                      >
                        <span className="flex items-center justify-center gap-1">
                          {statusIcon(entry) ?? <span className="num">{entry.isNew ? '' : (page - 1) * (paged ? size : 0) + r - newRows.length + 1}</span>}
                        </span>
                      </td>
                      {columns.map((col, c) => {
                        const isActive = active?.r === r && active.c === c;
                        const editable = canEdit(col, entry.row);
                        const err = errs[col.key];
                        return (
                          <td
                            key={col.key}
                            role="gridcell"
                            aria-selected={isActive}
                            title={err}
                            onMouseDown={() => {
                              if (isActive && editing) return;
                              setActive({ r, c });
                            }}
                            onClick={() => {
                              if (col.editor === 'switch' && editable) commit(r, c, !col.value(entry.row));
                              else if (isActive && col.editor === 'select' && editable && !editing) startEdit();
                            }}
                            onDoubleClick={() => editable && col.editor !== 'switch' && startEdit()}
                            className={cn(
                              'relative h-9 truncate border-r border-b border-border p-0 transition-colors',
                              rowBg,
                              editable ? 'cursor-cell' : 'text-muted',
                              !editable && col.editor && 'bg-surface-2/40',
                              err && 'shadow-[inset_0_0_0_1px_var(--danger)]',
                              isActive && 'z-[5] shadow-[inset_0_0_0_2px_var(--primary)]',
                            )}
                          >
                            {isActive && editing ? (
                              renderEditor(entry, col, r, c)
                            ) : (
                              <div className={cn('flex h-full items-center truncate px-2', col.align === 'right' && 'justify-end', col.align === 'center' && 'justify-center')}>
                                {col.editor === 'switch' ? (
                                  <span
                                    aria-hidden
                                    className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', col.value(entry.row) ? 'bg-success' : 'bg-border')}
                                  >
                                    <span className={cn('inline-block size-4 rounded-full bg-white shadow transition-transform', col.value(entry.row) ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                                  </span>
                                ) : col.display ? (
                                  col.display(entry.row)
                                ) : (
                                  <span className={cn('truncate', col.editor === 'number' && 'num')}>{fmtValue(col.value(entry.row)) || (err ? <span className="text-danger/70">ต้องกรอก</span> : '')}</span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {hasActions && (
                        <td className={cn('sticky right-0 z-10 border-b border-l border-border', rowBg)}>
                          <div className="flex items-center justify-center gap-0.5">
                            {entry.isNew ? (
                              <button type="button" onClick={() => discardNew(entry.key)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="ทิ้งแถวใหม่" title="ทิ้งแถวใหม่">
                                <Trash2 className="size-4" />
                              </button>
                            ) : (
                              <>
                                {onOpen && (
                                  <button type="button" onClick={() => onOpen(entry.row)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-primary" aria-label="เปิดรายละเอียด" title="เปิดรายละเอียด">
                                    <ExternalLink className="size-4" />
                                  </button>
                                )}
                                {onDelete && (
                                  <button type="button" onClick={() => onDelete(entry.row)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="ลบ" title="ลบ">
                                    <Trash2 className="size-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && entries.length === 0 && empty}
      </div>

      {/* error ของแถวที่เลือก */}
      {active && entries[active.r] && status[entries[active.r].key]?.state === 'error' && (
        <div role="alert" className="flex items-center gap-2 border-t border-danger/30 bg-danger-soft px-4 py-2 text-xs text-danger">
          <AlertTriangle className="size-3.5" />
          {(status[entries[active.r].key] as { message: string }).message}
        </div>
      )}

      {paged && (
        <Pagination
          page={page}
          pageSize={size}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setSize(s);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
