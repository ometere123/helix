"use client";

import { useState, useCallback } from "react";
import { EXPLORERS, type ExplorerId, explorerAddressUrl, explorerTxUrl } from "@/lib/contracts";

const STORAGE_KEY = "helix_explorer";

function getInitialExplorer(): ExplorerId {
  if (typeof window === "undefined") return EXPLORERS[0].id;
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ExplorerId | null;
    if (stored && EXPLORERS.some((e) => e.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return EXPLORERS[0].id;
}

export function useExplorer() {
  const [id, setId] = useState<ExplorerId>(getInitialExplorer);

  const setExplorer = useCallback((next: ExplorerId) => {
    setId(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const current = EXPLORERS.find((e) => e.id === id) ?? EXPLORERS[0];

  return {
    id,
    name: current.name,
    baseUrl: current.baseUrl,
    options: EXPLORERS,
    setExplorer,
    txUrl: (hash: string) => explorerTxUrl(current.baseUrl, hash),
    addressUrl: (addr: string) => explorerAddressUrl(current.baseUrl, addr),
  };
}
