import { Info, X } from 'lucide-react';
import { useState } from 'react';
import { useMarketplaces } from '../lib/queries';

const KEY = 'pricewise.sampleBanner.dismissed';

export function SampleDataBanner() {
  const { data } = useMarketplaces();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const liveCount = data?.filter((m) => m.liveEnabled).length ?? 0;
  if (dismissed || !data) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-sm sm:items-center">
        <Info size={16} className="mt-0.5 shrink-0 sm:mt-0" aria-hidden="true" />
        <p className="flex-1">
          <strong>Demo prices.</strong>{' '}
          {liveCount === 0
            ? 'All prices, offers and price history are sample data, not live quotes. Live prices appear once store API keys are connected.'
            : `Live prices are on for ${liveCount} store${liveCount > 1 ? 's' : ''}; rows tagged “Sample” are demonstration data.`}
        </p>
        <button
          aria-label="Dismiss notice"
          className="rounded p-1 hover:bg-amber-100"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(KEY, '1');
            } catch {
              /* ignore */
            }
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function SampleTag() {
  return (
    <span title="Sample data for demonstration, not a live price" className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Sample
    </span>
  );
}
