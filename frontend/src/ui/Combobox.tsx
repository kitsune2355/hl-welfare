import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../shared/cn';

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  /** แสดงปุ่ม × ล้างค่า */
  clearable?: boolean;
  /** พิมพ์ค่าใหม่ที่ไม่มีในรายการได้ (เช่น ตำแหน่ง) */
  creatable?: boolean;
  size?: 'sm' | 'md';
  /** cell = ไม่มีกรอบ ใช้ในตาราง Excel */
  variant?: 'default' | 'cell';
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  /** เปิดรายการทันทีที่ mount (ใช้เป็น editor ในตาราง) */
  autoOpen?: boolean;
  /** ปิด popover — committed = เลือกค่าแล้ว */
  onClose?: (committed: boolean) => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFC');

/** Select ที่พิมพ์ค้นหาได้ — คีย์บอร์ด ↑ ↓ Enter Esc, รองรับค่าที่ไม่อยู่ในรายการ (creatable) */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'เลือก…',
  disabled,
  clearable,
  creatable,
  size = 'md',
  variant = 'default',
  className,
  id,
  autoOpen,
  onClose,
  ...aria
}: Props) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(`${o.label} ${o.hint ?? ''} ${o.value}`).includes(q));
  }, [options, query]);
  const canCreate = creatable && query.trim() !== '' && !options.some((o) => norm(o.label) === norm(query.trim()));
  const items: ComboOption[] = canCreate ? [{ value: query.trim(), label: `ใช้ “${query.trim()}”` }, ...filtered] : filtered;

  const place = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 220);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom;
    setPos(below < 300 && r.top > below ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
  };

  const openList = (initial = '') => {
    if (disabled) return;
    place();
    setQuery(initial);
    const idx = options.findIndex((o) => o.value === value);
    setActive(initial ? 0 : Math.max(0, idx));
    setOpen(true);
  };

  const close = (committed: boolean) => {
    setOpen(false);
    setQuery('');
    onClose?.(committed);
    if (!onClose) trigger.current?.focus();
  };

  const pick = (o: ComboOption) => {
    onChange(o.value);
    close(true);
  };

  useEffect(() => {
    if (autoOpen) openList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const onMove = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    pop.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ' || e.key === 'F2') {
      e.preventDefault();
      openList();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openList(e.key);
    }
  };

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = items[active];
      if (o) pick(o);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    } else if (e.key === 'Tab') {
      const o = items[active];
      if (o && query) pick(o);
      else close(false);
    }
  };

  const cell = variant === 'cell';
  return (
    <>
      <div className={cn('relative', className)}>
        <button
          ref={trigger}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={onTriggerKey}
          {...aria}
          className={cn(
            'flex w-full items-center gap-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            cell
              ? 'h-full min-h-8 bg-transparent px-2 text-[13px] focus:outline-none'
              : cn(
                  'rounded-lg border border-border bg-surface pr-2.5 pl-3 shadow-xs hover:border-muted/50 focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none aria-invalid:border-danger',
                  size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm',
                  open && 'border-primary ring-4 ring-ring',
                ),
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && !value && 'text-muted/80')}>{selected?.label ?? (value || placeholder)}</span>
          {clearable && value && !disabled && (
            <span
              role="button"
              aria-label="ล้างค่า"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-3.5" />
            </span>
          )}
          {!cell && <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />}
        </button>
      </div>

      {open &&
        createPortal(
          <div
            ref={pop}
            className="animate-pop fixed z-[70] overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_32px_rgb(0_0_0/0.14)]"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted" />
              <input
                ref={search}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
                placeholder="พิมพ์เพื่อค้นหา…"
                aria-label="ค้นหาตัวเลือก"
                aria-controls={listId}
                aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
                className="h-10 w-full bg-transparent text-sm placeholder:text-muted/70 focus:outline-none"
              />
            </div>
            <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
              {items.length === 0 ? (
                <li className="px-3 py-6 text-center text-[13px] text-muted">ไม่พบตัวเลือก</li>
              ) : (
                items.map((o, i) => {
                  const isSel = o.value === value && !(canCreate && i === 0);
                  return (
                    <li
                      key={`${o.value}-${i}`}
                      id={`${listId}-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={isSel}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]',
                        i === active ? 'bg-primary-soft text-primary' : 'text-fg',
                        canCreate && i === 0 && 'italic',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                      </span>
                      {isSel && <Check className="size-4 shrink-0" />}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
