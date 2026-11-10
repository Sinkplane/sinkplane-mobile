import { useEffect, useState } from 'react';

/**
 * Returns `value`, updated only after it has stayed unchanged for `delayMs`.
 * The pending update is cancelled on unmount and whenever `value` changes again.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
