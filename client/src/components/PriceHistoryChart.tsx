import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketplaceId } from '@shared/types';
import { inr } from '../lib/format';
import { useHistory, useMarketplaceMap } from '../lib/queries';
import { ErrorState, Skeleton } from './States';

const RANGES = [30, 90, 180] as const;
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export function PriceHistoryChart({ productId }: { productId: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(90);
  const { data, isLoading, error, refetch } = useHistory(productId, days);
  const markets = useMarketplaceMap();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { rows, stores } = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    const storeSet = new Set<MarketplaceId>();
    for (const p of data ?? []) {
      storeSet.add(p.marketplaceId);
      const row = byDate.get(p.date) ?? { date: p.date };
      row[p.marketplaceId] = p.price;
      byDate.set(p.date, row);
    }
    return { rows: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), stores: [...storeSet] };
  }, [data]);

  return (
    <section aria-labelledby="history-heading" className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="history-heading" className="text-lg font-bold">
          Price history
        </h2>
        <div role="group" aria-label="Time range" className="flex rounded-xl bg-ink-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`rounded-lg px-3 py-1 text-sm font-medium ${days === r ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500'}`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 h-72">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : error ? (
          <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#eaecf0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => shortDate.format(new Date(d))}
                tick={{ fontSize: 12, fill: '#667085' }}
                minTickGap={32}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
                tick={{ fontSize: 12, fill: '#667085' }}
                width={56}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(v, name) => [inr(Number(v)), markets.get(name as MarketplaceId)?.name ?? String(name)]}
                labelFormatter={(d) => shortDate.format(new Date(String(d)))}
                contentStyle={{ borderRadius: 12, border: '1px solid #eaecf0', fontSize: 13 }}
              />
              <Legend
                formatter={(v: string) => markets.get(v as MarketplaceId)?.name ?? v}
                onClick={(e) => {
                  const key = String(e.dataKey);
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                wrapperStyle={{ fontSize: 13, cursor: 'pointer' }}
              />
              {stores.map((s) => (
                <Line
                  key={s}
                  type="stepAfter"
                  dataKey={s}
                  stroke={markets.get(s)?.color ?? '#667085'}
                  strokeWidth={2}
                  dot={false}
                  hide={hidden.has(s)}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-500">Tap a store in the legend to hide or show it. Sample history is synthetic and for demonstration.</p>
    </section>
  );
}
