import { Star } from 'lucide-react';
import { compactNumber } from '../lib/format';

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex items-center gap-0.5 rounded-md bg-deal-600 px-1.5 py-0.5 text-xs font-semibold text-white">
        {value.toFixed(1)} <Star size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      </span>
      {count !== undefined && <span className="text-ink-500">{compactNumber(count)} ratings</span>}
      <span className="sr-only">Rated {value.toFixed(1)} out of 5</span>
    </span>
  );
}
