import { useCallback, useState } from "react";

// useState, persisted to localStorage.
//
// UI settings live here rather than in IndexedDB (where activity data lives)
// because localStorage reads are synchronous: an async load would render the
// default value first and visibly flip to the stored one a moment later.
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    try {
      return JSON.parse(stored) as T;
    } catch {
      console.warn(`couldn't parse localStorage key ${key}:`, stored);
      return defaultValue;
    }
  });

  const setAndStore = useCallback(
    (newValue: T) => {
      setValue(newValue);
      localStorage.setItem(key, JSON.stringify(newValue));
    },
    [key],
  );

  return [value, setAndStore];
}
