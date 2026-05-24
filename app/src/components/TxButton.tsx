"use client";

import type { ReactNode } from "react";

export type TxPhase =
  | "idle"
  | "approving"
  | "acting"
  | "success"
  | "error"
  | (string & {});

interface Props {
  onClick: () => void | Promise<void>;
  phase: TxPhase;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
}

export function TxButton({
  onClick,
  phase,
  disabled,
  children,
  className = "",
  variant = "primary",
  fullWidth = false,
}: Props) {
  const busy =
    phase === "approving" ||
    phase === "acting" ||
    (phase !== "idle" && phase !== "success" && phase !== "error");

  const label = (() => {
    if (phase === "approving") return <Loading text="Approving" />;
    if (phase === "acting")    return <Loading text="Confirming" />;
    if (phase === "success")   return <Done />;
    if (phase === "error")     return "Try again";
    if (phase === "idle")      return children;
    const friendly = phase.charAt(0).toUpperCase() +
      phase.slice(1).replace(/([A-Z])/g, " $1").toLowerCase();
    return <Loading text={friendly} />;
  })();

  const base = [
    "inline-flex items-center justify-center gap-2",
    "h-10 px-4 rounded-md text-sm font-medium",
    "transition-colors duration-150",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    fullWidth ? "w-full" : "",
  ].filter(Boolean).join(" ");

  const styles: Record<string, string> = {
    primary:   "bg-brand text-white hover:bg-brand/90",
    secondary: "border border-line bg-surface text-ink hover:bg-brand-wash",
    danger:    "bg-cta text-white hover:bg-cta/90",
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled || busy}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {label}
    </button>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <>
      <span className="spinner" />
      {text}…
    </>
  );
}

function Done() {
  return (
    <>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Done
    </>
  );
}
