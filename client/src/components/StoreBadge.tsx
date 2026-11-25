import type { MarketplaceId } from '@shared/types';
import { useMarketplaceMap } from '../lib/queries';

export function StoreBadge({ id, size = 'md' }: { id: MarketplaceId; size?: 'sm' | 'md' }) {
  const m = useMarketplaceMap().get(id);
  const name = m?.name ?? id;
  const color = m?.color ?? '#667085';
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-ink-900 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-md font-bold text-white ${size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-xs'}`}
        style={{ backgroundColor: color }}
      >
        {name.charAt(0)}
      </span>
      {name}
    </span>
  );
}
