import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Config, type Item, type Rental } from '../api';

interface Data {
  rentals: Rental[];
  items: Item[];
  config: Config | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  itemName: (id: string) => string;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [r, i, c] = await Promise.all([api.rentals(), api.items(), api.config()]);
      setRentals(r);
      setItems(i);
      setConfig(c);
      setError('');
    } catch (e) {
      setError((e as Error).message === 'Failed to fetch' ? 'Cannot reach the Handback server. Is `npm run dev` running?' : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const itemName = useCallback((id: string) => items.find((i) => i.id === id)?.name ?? id, [items]);

  return <Ctx.Provider value={{ rentals, items, config, loading, error, refresh, itemName }}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
