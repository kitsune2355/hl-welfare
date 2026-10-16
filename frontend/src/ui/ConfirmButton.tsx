import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Modal, useToast } from './Overlay';

interface Props {
  /** ข้อความบนปุ่ม (ไม่ใส่ = ปุ่มไอคอน) */
  label?: string;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  successMessage: string;
  onConfirm: () => Promise<unknown>;
  size?: 'sm' | 'md';
}

/** ปุ่มที่ต้องยืนยันก่อนทำงาน (ยกเลิก / ลบ) — แสดง Toast ทั้งสำเร็จและล้มเหลว */
export function ConfirmButton({ label, icon, title, description, children, confirmLabel, successMessage, onConfirm, size = 'sm' }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      toast.success(successMessage);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant="ghost"
        icon={icon}
        aria-label={label ? undefined : title}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="hover:text-danger"
      >
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              ไม่ใช่
            </Button>
            <Button variant="danger" loading={busy} onClick={run}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </Modal>
    </>
  );
}
