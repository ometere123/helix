import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <div className="text-xs text-ink-muted">{hint}</div>}
    </label>
  );
}

const inputCls = [
  "w-full h-10 px-3 rounded-md border border-line",
  "bg-bg text-ink placeholder-ink-muted/60",
  "text-sm font-mono",
  "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
  "transition-colors duration-150",
].join(" ");

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full px-3 py-2 rounded-md border border-line",
        "bg-bg text-ink placeholder-ink-muted/60",
        "text-sm",
        "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
        "transition-colors duration-150",
        "resize-none",
        props.className ?? "",
      ].join(" ")}
    />
  );
}
