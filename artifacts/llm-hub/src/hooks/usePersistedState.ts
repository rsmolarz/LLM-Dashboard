import { useState, useEffect, useCallback, useRef } from "react";

export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setStateRaw] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {}
    return defaultValue;
  });

  const stateRef = useRef(state);

  const setState: React.Dispatch<React.SetStateAction<T>> = useCallback((action) => {
    setStateRaw((prev) => {
      const next = typeof action === "function" ? (action as (prev: T) => T)(prev) : action;
      stateRef.current = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [key]);

  return [state, setState];
}

export function usePersistedStateWithLimit<T>(key: string, defaultValue: T[], maxItems: number): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [state, setStateRaw] = usePersistedState<T[]>(key, defaultValue);

  const setState: React.Dispatch<React.SetStateAction<T[]>> = useCallback((action) => {
    setStateRaw((prev) => {
      const next = typeof action === "function" ? (action as (prev: T[]) => T[])(prev) : action;
      return next.slice(-maxItems);
    });
  }, [setStateRaw, maxItems]);

  return [state, setState];
}
