import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CategoryId } from '@shared/types';

export const MAX_COMPARE = 4;
const STORAGE_KEY = 'pricewise.compare.v1';

export interface CompareItem {
  id: string;
  title: string;
  category: CategoryId;
}

interface CompareCtx {
  items: CompareItem[];
  has: (id: string) => boolean;
  /** Returns an error message when the item can't be added. */
  toggle: (item: CompareItem) => string | null;
  remove: (id: string) => void;
  clear: () => void;
}

const Ctx = createContext<CompareCtx | null>(null);

function load(): CompareItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is CompareItem => typeof x?.id === 'string' && typeof x?.title === 'string' && typeof x?.category === 'string')
      .slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode); compare still works for this visit */
    }
  }, [items]);

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);
  const remove = useCallback((id: string) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const toggle = useCallback(
    (item: CompareItem) => {
      if (items.some((i) => i.id === item.id)) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        return null;
      }
      if (items.length >= MAX_COMPARE) return `You can compare up to ${MAX_COMPARE} products at a time.`;
      const first = items[0];
      if (first && first.category !== item.category) return 'Compare products from the same category for a fair side by side view.';
      setItems((prev) => [...prev, item]);
      return null;
    },
    [items],
  );

  const value = useMemo(() => ({ items, has, toggle, remove, clear }), [items, has, toggle, remove, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompareList(): CompareCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCompareList must be used inside CompareProvider');
  return ctx;
}
