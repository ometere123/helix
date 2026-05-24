"use client";

import { useExplorer } from "@/hooks/useExplorer";
import type { ExplorerId } from "@/lib/contracts";

export function ExplorerPicker() {
  const { id, options, setExplorer } = useExplorer();

  // Hide if only one explorer is configured
  if (options.length <= 1) return null;

  return (
    <select
      value={id}
      onChange={(e) => setExplorer(e.target.value as ExplorerId)}
      className="h-9 px-2 rounded-md border border-line bg-surface text-sm text-ink whitespace-nowrap"
      aria-label="Choose block explorer"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
