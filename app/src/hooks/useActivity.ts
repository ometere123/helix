"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { addActivity, clearActivity, getActivity, type ActivityEntry } from "@/lib/activity";

export type { ActivityEntry };

export function useActivity() {
  const { address } = useAccount();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  // Load from storage whenever address changes
  useEffect(() => {
    setEntries(address ? getActivity(address) : []);
  }, [address]);

  const add = useCallback(
    (entry: Omit<ActivityEntry, "ts">) => {
      if (!address) return;
      addActivity(address, entry);
      setEntries(getActivity(address));
    },
    [address],
  );

  const clear = useCallback(() => {
    if (!address) return;
    clearActivity(address);
    setEntries([]);
  }, [address]);

  return { entries, add, clear };
}
