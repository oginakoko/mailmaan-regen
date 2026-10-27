import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-lg border border-[#1c1917]/25 bg-white px-3 py-2.5 text-sm text-[#1c1917] placeholder:text-[#1c1917]/40 focus:border-[#1c1917] focus:outline-none";

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs text-[#1c1917]/55">
      {children}
    </p>
  );
}

type FieldShellProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  htmlFor: string;
  children: ReactNode;
};

function FieldShell({ label, hint, error, htmlFor, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={htmlFor} className="block font-semibold text-[#1c1917]">
        {label}
      </label>
      {children}
      {hint ? <Hint id={`${htmlFor}-hint`}>{hint}</Hint> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-[#b3402a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useDescribedBy(hint: ReactNode, error: string | undefined, id: string): string | undefined {
  const ids: string[] = [];
  if (hint) ids.push(`${id}-hint`);
  if (error) ids.push(`${id}-error`);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

type TextFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  mono?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, hint, error, mono, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  const describedBy = useDescribedBy(hint, error, controlId);
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={controlId}>
      <input
        id={controlId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${CONTROL} ${mono ? "font-mono" : ""} ${error ? "border-[#b3402a]" : ""}`}
        {...rest}
      />
    </FieldShell>
  );
}

type TextAreaFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  mono?: boolean;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ label, hint, error, mono, id, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  const describedBy = useDescribedBy(hint, error, controlId);
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={controlId}>
      <textarea
        id={controlId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${CONTROL} ${mono ? "font-mono text-xs leading-5" : ""} ${error ? "border-[#b3402a]" : ""}`}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ label, hint, error, children, id, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  const describedBy = useDescribedBy(hint, error, controlId);
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={controlId}>
      <select
        id={controlId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${CONTROL} ${error ? "border-[#b3402a]" : ""}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type CheckboxFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function CheckboxField({ label, hint, id, ...rest }: CheckboxFieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <input
        id={controlId}
        type="checkbox"
        aria-describedby={hint ? `${controlId}-hint` : undefined}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#1c1917]"
        {...rest}
      />
      <div className="space-y-0.5">
        <label htmlFor={controlId} className="cursor-pointer font-medium text-[#1c1917]">
          {label}
        </label>
        {hint ? <Hint id={`${controlId}-hint`}>{hint}</Hint> : null}
      </div>
    </div>
  );
}
