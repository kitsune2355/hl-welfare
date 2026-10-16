import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../shared/cn';
import { Combobox, type ComboOption } from './Combobox';

const control =
  'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-xs transition-colors placeholder:text-muted/70 hover:border-muted/50 focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus:ring-danger/20';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  onChange: (v: string) => void;
};

/** Field + Input แบบสำเร็จรูป */
export function TextField({ label, hint, error, required, className, onChange, ...rest }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!error || undefined} required={required} onChange={(e) => onChange(e.target.value)} {...rest} />}
    </Field>
  );
}

type SelectFieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  value: string;
  options: ComboOption[];
  /** มีค่า = ล้างค่าได้ (ไม่บังคับเลือก) */
  placeholder?: string;
  creatable?: boolean;
  disabled?: boolean;
  onChange: (v: string) => void;
};

/** Field + Combobox (พิมพ์ค้นหาได้) */
export function SelectField({ label, hint, error, required, className, options, placeholder, creatable, disabled, value, onChange }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => (
        <Combobox
          id={id}
          aria-describedby={d}
          aria-invalid={!!error || undefined}
          value={value}
          onChange={onChange}
          options={options}
          placeholder={placeholder ?? 'เลือก…'}
          clearable={placeholder !== undefined}
          creatable={creatable}
          disabled={disabled}
        />
      )}
    </Field>
  );
}
