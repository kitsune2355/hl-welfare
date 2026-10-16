import { CheckCircle2, X, XCircle } from 'lucide-react';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../shared/cn';
import { IconButton } from './Button';

// ===================== Modal =====================
interface ModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md';
}

export function Modal({ open, title, description, children, footer, onClose, size = 'sm' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const els = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea');
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn('animate-pop relative w-full rounded-2xl border border-border bg-surface shadow-[0_20px_50px_rgb(0_0_0/0.2)]', size === 'sm' ? 'max-w-md' : 'max-w-2xl')}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          </div>
          <IconButton label="ปิด" onClick={onClose} className="-mt-1 -mr-2">
            <X />
          </IconButton>
        </div>
        {children && <div className="px-6 pt-4">{children}</div>}
        <div className="mt-5 flex justify-end gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-6 py-3.5">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

// ===================== Toast =====================
type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push]);

  return (
    <ToastContext value={api}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="animate-pop pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-success" /> : <XCircle className="mt-0.5 size-[18px] shrink-0 text-danger" />}
            <p className="flex-1 text-[13px]">{t.message}</p>
            <button className="text-muted hover:text-fg" aria-label="ปิด" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const t = use(ToastContext);
  if (!t) throw new Error('ToastProvider missing');
  return t;
}
