import { ChevronDown } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../shared/cn';

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

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(control, 'appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
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

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange: (v: string) => void;
};

export function SelectField({ label, hint, error, required, className, options, placeholder, onChange, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => (
        <Select id={id} aria-describedby={d} aria-invalid={!!error || undefined} required={required} onChange={(e) => onChange(e.target.value)} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
