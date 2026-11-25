import { ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InsightCard } from '../components/InsightCard';
import { OffersTable } from '../components/OffersTable';
import { PriceHistoryChart } from '../components/PriceHistoryChart';
import { CompareToggle } from '../components/ProductCard';
import { ProductVisual } from '../components/ProductVisual';
import { Rating } from '../components/Rating';
import { SampleTag } from '../components/SampleDataBanner';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { StoreBadge } from '../components/StoreBadge';
import { ApiRequestError } from '../lib/api';
import { inr } from '../lib/format';
import { useCategories, useProduct } from '../lib/queries';

export function ProductPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useProduct(id);
  const categories = useCategories();

  useEffect(() => {
    if (data) document.title = `${data.product.title} – compare prices | PriceWise`;
    return () => {
      document.title = 'PriceWise – Compare prices across Indian stores';
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <Skeleton className="h-96" />
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }
  if (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16">
          <EmptyState title="Product not found">
            It may have been removed. <Link className="font-semibold text-brand-700" to="/search">Browse all products</Link>.
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return null;

  const { product, offers, insight } = data;
  const best = offers.find((o) => o.isBestPrice);
  const worst = offers.filter((o) => o.inStock).at(-1);
  const categoryLabel = categories.data?.find((c) => c.id === product.category)?.label ?? product.category;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-ink-500">
        <Link to="/" className="hover:text-brand-700">Home</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link to={`/search?category=${product.category}`} className="hover:text-brand-700">{categoryLabel}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="truncate text-ink-700">{product.brand}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
            <ProductVisual category={product.category} brand={product.brand} image={product.image} size="lg" />
            <h1 className="mt-5 text-xl font-bold leading-snug">{product.title}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Rating value={product.rating} count={product.ratingCount} />
              {data.dataSource === 'sample' && <SampleTag />}
            </div>
            {best && (
              <div className="mt-5 rounded-xl bg-deal-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-deal-700">Best price today</p>
                <p className="text-3xl font-extrabold text-ink-900">{inr(best.effectivePrice)}</p>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
                  at <StoreBadge id={best.marketplaceId} size="sm" />
                </div>
                {worst && worst.effectivePrice > best.effectivePrice && (
                  <p className="mt-2 text-sm font-medium text-deal-700">
                    {inr(worst.effectivePrice - best.effectivePrice)} less than the most expensive store
                  </p>
                )}
                <a
                  href={best.url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-4 flex w-full items-center justify-center rounded-xl bg-deal-600 py-3 text-sm font-semibold text-white hover:bg-deal-700"
                >
                  Buy at {inr(best.effectivePrice)}
                </a>
              </div>
            )}
            <div className="mt-3">
              <CompareToggle id={product.id} title={product.title} category={product.category} />
            </div>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="font-bold">Key specifications</h2>
            <dl className="mt-3 divide-y divide-ink-100 text-sm">
              {Object.entries(product.specs).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-2">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="font-medium text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <InsightCard insight={insight} />
          <OffersTable offers={offers} />
          <PriceHistoryChart productId={product.id} />
        </div>
      </div>
    </div>
  );
}
