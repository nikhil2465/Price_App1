import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CategoryId, SortKey } from '@shared/types';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import type { SearchFilters } from '../lib/api';
import { inr } from '../lib/format';
import { useCategories, useMarketplaces, useSearch } from '../lib/queries';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'savings', label: 'Biggest savings' },
  { value: 'rating', label: 'Top rated' },
];
const SORT_VALUES = new Set(SORTS.map((s) => s.value));

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const num = (v: string | null) => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
};

function useFiltersFromUrl(): [SearchFilters, (patch: Partial<SearchFilters>) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<SearchFilters>(() => {
    const sort = params.get('sort') as SortKey | null;
    return {
      q: params.get('q') ?? '',
      category: (params.get('category') as CategoryId | null) ?? undefined,
      brands: list(params.get('brand')),
      marketplaces: list(params.get('marketplaces')),
      minPrice: num(params.get('minPrice')),
      maxPrice: num(params.get('maxPrice')),
      sort: sort && SORT_VALUES.has(sort) ? sort : 'relevance',
    };
  }, [params]);

  const update = (patch: Partial<SearchFilters>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.category) p.set('category', next.category);
    if (next.brands.length) p.set('brand', next.brands.join(','));
    if (next.marketplaces.length) p.set('marketplaces', next.marketplaces.join(','));
    if (next.minPrice !== undefined) p.set('minPrice', String(next.minPrice));
    if (next.maxPrice !== undefined) p.set('maxPrice', String(next.maxPrice));
    if (next.sort !== 'relevance') p.set('sort', next.sort);
    setParams(p, { replace: true });
  };
  return [filters, update];
}

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Checkbox({ checked, onChange, label, count }: { checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded accent-brand-700" />
      <span className="flex-1 text-ink-700">{label}</span>
      {count !== undefined && <span className="text-xs text-ink-500">{count}</span>}
    </label>
  );
}

function PriceRange({ min, max, onApply }: { min?: number; max?: number; onApply: (min?: number, max?: number) => void }) {
  const [lo, setLo] = useState(min?.toString() ?? '');
  const [hi, setHi] = useState(max?.toString() ?? '');
  useEffect(() => {
    setLo(min?.toString() ?? '');
    setHi(max?.toString() ?? '');
  }, [min, max]);
  const loN = num(lo);
  const hiN = num(hi);
  const invalid = loN !== undefined && hiN !== undefined && loN > hiN;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onApply(loN, hiN);
      }}
    >
      <div className="flex items-center gap-2">
        <input inputMode="numeric" aria-label="Minimum price" placeholder="Min ₹" value={lo} onChange={(e) => setLo(e.target.value.replace(/\D/g, ''))} className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm" />
        <span className="text-ink-500">–</span>
        <input inputMode="numeric" aria-label="Maximum price" placeholder="Max ₹" value={hi} onChange={(e) => setHi(e.target.value.replace(/\D/g, ''))} className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm" />
      </div>
      {invalid && <p className="mt-1 text-xs text-red-600">Min must be less than max.</p>}
      <button disabled={invalid} className="mt-2 w-full rounded-lg bg-ink-100 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-300/40 disabled:opacity-50">
        Apply price
      </button>
    </form>
  );
}

export function SearchPage() {
  const [filters, update] = useFiltersFromUrl();
  const { data, isLoading, isFetching, error, refetch } = useSearch(filters);
  const categories = useCategories();
  const markets = useMarketplaces();
  const [showFilters, setShowFilters] = useState(false);

  const activeCount =
    (filters.category ? 1 : 0) + filters.brands.length + filters.marketplaces.length + (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0);
  const categoryLabel = categories.data?.find((c) => c.id === filters.category)?.label;
  const heading = filters.q ? `Results for “${filters.q}”` : categoryLabel ?? 'All products';

  const panel = (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Category</p>
        <select
          aria-label="Category"
          value={filters.category ?? ''}
          onChange={(e) => update({ category: (e.target.value || undefined) as CategoryId | undefined, brands: [] })}
          className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Stores</p>
        {markets.data?.map((m) => (
          <Checkbox key={m.id} label={m.name} checked={filters.marketplaces.includes(m.id)} onChange={() => update({ marketplaces: toggle(filters.marketplaces, m.id) })} />
        ))}
      </div>
      {data && data.facets.brands.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Brand</p>
          {data.facets.brands.map((b) => (
            <Checkbox key={b.value} label={b.value} count={b.count} checked={filters.brands.includes(b.value)} onChange={() => update({ brands: toggle(filters.brands, b.value) })} />
          ))}
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Price (you pay)</p>
        {data && data.facets.priceRange.max > 0 && (
          <p className="mb-2 text-xs text-ink-500">
            From {inr(data.facets.priceRange.min)} to {inr(data.facets.priceRange.max)}
          </p>
        )}
        <PriceRange min={filters.minPrice} max={filters.maxPrice} onApply={(minPrice, maxPrice) => update({ minPrice, maxPrice })} />
      </div>
      {activeCount > 0 && (
        <button
          onClick={() => update({ category: undefined, brands: [], marketplaces: [], minPrice: undefined, maxPrice: undefined })}
          className="w-full rounded-lg py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{heading}</h1>
          <p className="text-sm text-ink-500" aria-live="polite">
            {data ? `${data.total} product${data.total === 1 ? '' : 's'} compared across stores` : 'Searching…'}
            {isFetching && data ? ' · updating' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-medium lg:hidden"
          >
            <SlidersHorizontal size={16} aria-hidden="true" /> Filters{activeCount ? ` (${activeCount})` : ''}
          </button>
          <label htmlFor="sort" className="sr-only">
            Sort by
          </label>
          <select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as SortKey })} className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside aria-label="Filters" className="hidden h-fit rounded-2xl border border-ink-100 bg-white p-4 shadow-card lg:sticky lg:top-24 lg:block">
          {panel}
        </aside>

        {showFilters && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="absolute inset-0 bg-ink-900/40" onClick={() => setShowFilters(false)} />
            <div className="relative ml-auto h-full w-80 max-w-[85vw] overflow-y-auto bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-lg font-bold">Filters</p>
                <button aria-label="Close filters" onClick={() => setShowFilters(false)} className="rounded p-1 hover:bg-ink-100">
                  <X size={20} />
                </button>
              </div>
              {panel}
            </div>
          </div>
        )}

        <div className="min-w-0 space-y-4">
          {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-44" />)}
          {error && <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />}
          {data && data.total === 0 && (
            <EmptyState title="No matching products">
              Try a shorter search, remove a filter, or browse a category. Our sample catalog covers phones, laptops, audio, TVs, watches, appliances,
              fashion and beauty.
            </EmptyState>
          )}
          {data?.results.map((s) => <ProductCard key={s.product.id} s={s} />)}
        </div>
      </div>
    </div>
  );
}
