"use client";

import { TOKENS, type StableSymbol } from "@/lib/tokens";

interface Props {
  value: StableSymbol;
  onChange: (next: StableSymbol) => void;
  options?: readonly StableSymbol[];
  className?: string;
}

export function TokenPicker({
  value,
  onChange,
  options = ["USDC", "EURC"],
  className = "",
}: Props) {
  return (
    <div
      className={`inline-flex rounded-md border border-line bg-bg p-0.5 ${className}`}
    >
      {options.map((sym) => {
        const active = sym === value;
        return (
          <button
            key={sym}
            type="button"
            onClick={() => onChange(sym)}
            className={[
              "px-3 h-8 rounded text-sm font-medium transition-colors",
              active
                ? "bg-brand text-white"
                : "text-ink-muted hover:text-ink",
            ].join(" ")}
          >
            {TOKENS[sym].symbol}
          </button>
        );
      })}
    </div>
  );
}
