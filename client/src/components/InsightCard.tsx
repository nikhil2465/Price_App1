import { Clock, ThumbsUp, TrendingDown } from 'lucide-react';
import type { PriceInsight } from '@shared/types';
import { inr } from '../lib/format';

const STYLE = {
  great: { box: 'border-deal-100 bg-deal-50', text: 'text-deal-700', Icon: ThumbsUp, label: 'Good time to buy' },
  fair: { box: 'border-brand-100 bg-brand-50', text: 'text-brand-700', Icon: TrendingDown, label: 'Fair price' },
  high: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-800', Icon: Clock, label: 'Consider waiting' },
} as const;

export function InsightCard({ insight }: { insight: PriceInsight }) {
  const s = STYLE[insight.verdict];
  return (
    <section aria-label="Buy or wait advice" className={`rounded-2xl border p-5 ${s.box}`}>
      <div className={`flex items-center gap-2 font-semibold ${s.text}`}>
        <s.Icon size={18} aria-hidden="true" /> {s.label}
      </div>
      <p className="mt-1 text-sm text-ink-700">{insight.advice}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ['90 day low', insight.lowest90d],
          ['Average', insight.average90d],
          ['90 day high', insight.highest90d],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/70 px-2 py-2">
            <dt className="text-xs text-ink-500">{k}</dt>
            <dd className="text-sm font-semibold">{inr(v as number)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
