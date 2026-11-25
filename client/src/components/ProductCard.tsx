import { Check, Plus, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ProductSummary } from '@shared/types';
import { useCompareList } from '../lib/compare';
import { inr } from '../lib/format';
import { useToast } from '../lib/toast';
import { ProductVisual } from './ProductVisual';
import { Rating } from './Rating';
import { SampleTag } from './SampleDataBanner';
import { StoreBadge } from './StoreBadge';

export function CompareToggle({ id, title, category }: { id: string; title: string; category: ProductSummary['product']['category'] }) {
  const compare = useCompareList();
  const toast = useToast();
  const active = compare.has(id);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        const err = compare.toggle({ id, title, category });
        if (err) toast(err);
      }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-300 text-ink-700 hover:border-brand-500 hover:text-brand-700'
      }`}
    >
      {active ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
      {active ? 'Added to compare' : 'Compare'}
    </button>
  );
}

export function ProductCard({ s }: { s: ProductSummary }) {
  const { product } = s;
  const specs = Object.entries(product.specs).slice(0, 4);
  return (
    <article className="group flex flex-col gap-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card transition hover:shadow-lift sm:flex-row">
      <Link to={`/product/${product.id}`} className="self-center sm:self-start" tabIndex={-1} aria-hidden="true">
        <ProductVisual category={product.category} brand={product.brand} image={product.image} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/product/${product.id}`} className="text-base font-semibold leading-snug text-ink-900 hover:text-brand-700">
          {product.title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Rating value={product.rating} count={product.ratingCount} />
          {s.dataSource === 'sample' && <SampleTag />}
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink-500 sm:grid-cols-2">
          {specs.map(([k, v]) => (
            <li key={k} className="truncate">
              <span className="text-ink-700">{k}:</span> {v}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 flex-col justify-between gap-3 border-t border-ink-100 pt-4 sm:w-60 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Lowest effective price</p>
          <p className="text-2xl font-bold text-ink-900">{inr(s.bestPrice)}</p>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
            at <StoreBadge id={s.bestMarketplaceId} size="sm" />
          </div>
          {s.maxSavings > 0 && (
            <p className="mt-2 inline-flex rounded-lg bg-deal-50 px-2 py-1 text-xs font-semibold text-deal-700">
              Save up to {inr(s.maxSavings)} vs other stores
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Link
            to={`/product/${product.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <Store size={16} aria-hidden="true" /> View {s.storeCount} store prices
          </Link>
          <CompareToggle id={product.id} title={product.title} category={product.category} />
        </div>
      </div>
    </article>
  );
}
