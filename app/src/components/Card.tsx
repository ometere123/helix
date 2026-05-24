import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg border border-line bg-surface p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
      {children}
    </div>
  );
}

export function StatRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-sm font-medium text-ink text-right ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
