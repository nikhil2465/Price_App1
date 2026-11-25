import { ArrowRight, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { MAX_COMPARE, useCompareList } from '../lib/compare';

export function CompareTray() {
  const { items, remove, clear } = useCompareList();
  const { pathname } = useLocation();
  if (items.length === 0 || pathname === '/compare') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white shadow-[0_-8px_24px_rgba(16,24,40,0.08)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 pr-20 sm:flex-row sm:items-center sm:pr-24">
        <p className="shrink-0 text-sm font-semibold">
          Compare ({items.length}/{MAX_COMPARE})
        </p>
        <ul className="flex flex-1 gap-2 overflow-x-auto">
          {items.map((i) => (
            <li key={i.id} className="flex max-w-56 shrink-0 items-center gap-1 rounded-lg bg-brand-50 py-1 pl-3 pr-1 text-sm text-brand-900">
              <span className="truncate">{i.title}</span>
              <button aria-label={`Remove ${i.title} from compare`} onClick={() => remove(i.id)} className="rounded p-1 hover:bg-brand-100">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={clear} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:text-ink-900">
            Clear
          </button>
          <Link
            to={`/compare?ids=${items.map((i) => i.id).join(',')}`}
            aria-disabled={items.length < 2}
            onClick={(e) => items.length < 2 && e.preventDefault()}
            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${
              items.length < 2 ? 'cursor-not-allowed bg-ink-300' : 'bg-deal-600 hover:bg-deal-700'
            }`}
          >
            {items.length < 2 ? 'Add one more' : 'Compare now'} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
