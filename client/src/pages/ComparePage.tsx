import { Award, ExternalLink, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { MarketplaceId, ProductDetail } from '@shared/types';
import { ProductVisual } from '../components/ProductVisual';
import { Rating } from '../components/Rating';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { StoreBadge } from '../components/StoreBadge';
import { useCompareList } from '../lib/compare';
import { inr } from '../lib/format';
import { useCompare, useMarketplaceMap } from '../lib/queries';

const VERDICT = { great: 'Good time to buy', fair: 'Fair price', high: 'Consider waiting' } as const;

function bestPrice(d: ProductDetail): number | null {
  return d.offers.find((o) => o.isBestPrice)?.effectivePrice ?? null;
}

export function ComparePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const compare = useCompareList();
  const markets = useMarketplaceMap();
  const ids = (params.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{1,80}$/.test(s))
    .slice(0, 4);
  const { data, isLoading, error, refetch } = useCompare(ids);

  if (ids.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState title="Pick at least two products">
          Use the <strong>Compare</strong> button on any product to add it, then come back here.{' '}
          <Link to="/search" className="font-semibold text-brand-700">Browse products</Link>
        </EmptyState>
      </div>
    );
  }
  if (isLoading) return <div className="mx-auto max-w-7xl px-4 py-6"><Skeleton className="h-[600px]" /></div>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState message={(error as Error | null)?.message ?? 'Could not load comparison'} onRetry={() => void refetch()} />
      </div>
    );
  }

  const prices = data.map(bestPrice);
  const validPrices = prices.filter((p): p is number => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;
  const maxRating = Math.max(...data.map((d) => d.product.rating));
  const specKeys = [...new Set(data.flatMap((d) => Object.keys(d.product.specs)))];
  const storeIds = [...new Set(data.flatMap((d) => d.offers.map((o) => o.marketplaceId)))] as MarketplaceId[];
  const cols = `minmax(150px,200px) repeat(${data.length}, minmax(200px, 1fr))`;

  function removeId(id: string) {
    compare.remove(id);
    const next = ids.filter((x) => x !== id);
    navigate(`/compare?ids=${next.join(',')}`, { replace: true });
  }

  const Row = ({ label, children, highlight }: { label: string; children: React.ReactNode[]; highlight?: boolean[] }) => (
    <div role="row" className="grid border-t border-ink-100" style={{ gridTemplateColumns: cols }}>
      <div role="rowheader" className="sticky left-0 z-10 bg-ink-50 px-4 py-3 text-sm font-medium text-ink-500">
        {label}
      </div>
      {children.map((c, i) => (
        <div role="cell" key={i} className={`px-4 py-3 text-sm ${highlight?.[i] ? 'bg-deal-50 font-semibold text-deal-700' : ''}`}>
          {c}
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold">Side by side comparison</h1>
      <p className="mt-1 text-sm text-ink-500">Green marks the lowest price and highest rating, and each product’s cheapest store. Prices are what you pay after the best bank offer and delivery.</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-card">
        <div role="table" aria-label="Product comparison" className="min-w-fit">
          <div role="row" className="grid" style={{ gridTemplateColumns: cols }}>
            <div className="sticky left-0 z-10 bg-white" />
            {data.map((d, i) => (
              <div role="columnheader" key={d.product.id} className="relative p-4">
                <button aria-label={`Remove ${d.product.title}`} onClick={() => removeId(d.product.id)} className="absolute right-3 top-3 rounded-full p-1 text-ink-500 hover:bg-ink-100">
                  <X size={16} />
                </button>
                <ProductVisual category={d.product.category} brand={d.product.brand} size="md" />
                <Link to={`/product/${d.product.id}`} className="mt-3 block text-sm font-semibold leading-snug hover:text-brand-700">
                  {d.product.title}
                </Link>
                {prices[i] !== null && prices[i] === minPrice && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-deal-600 px-2 py-0.5 text-xs font-semibold text-white">
                    <Award size={12} aria-hidden="true" /> Lowest price
                  </span>
                )}
              </div>
            ))}
          </div>

          <Row label="Best price" highlight={prices.map((p) => p !== null && p === minPrice)}>
            {prices.map((p, i) => <span key={i} className="text-base font-bold">{p === null ? 'Out of stock' : inr(p)}</span>)}
          </Row>
          <Row label="Cheapest at">
            {data.map((d) => {
              const b = d.offers.find((o) => o.isBestPrice);
              return b ? (
                <a key={d.product.id} href={b.url} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex items-center gap-1 hover:underline">
                  <StoreBadge id={b.marketplaceId} size="sm" /> <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : (
                '—'
              );
            })}
          </Row>
          <Row label="Buy or wait">
            {data.map((d) => <span key={d.product.id}>{VERDICT[d.insight.verdict]}</span>)}
          </Row>
          <Row label="90 day low">{data.map((d) => inr(d.insight.lowest90d))}</Row>
          <Row label="Rating" highlight={data.map((d) => d.product.rating === maxRating)}>
            {data.map((d) => <Rating key={d.product.id} value={d.product.rating} count={d.product.ratingCount} />)}
          </Row>
          {specKeys.map((k) => (
            <Row key={k} label={k}>
              {data.map((d) => d.product.specs[k] ?? '—')}
            </Row>
          ))}
          <div className="border-t border-ink-100 bg-ink-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Price at each store</div>
          {storeIds.map((sid) => {
            const cells = data.map((d) => d.offers.find((o) => o.marketplaceId === sid));
            return (
              <Row key={sid} label={markets.get(sid)?.name ?? sid} highlight={cells.map((c) => Boolean(c?.isBestPrice))}>
                {cells.map((c, i) => (c ? (c.inStock ? inr(c.effectivePrice) : <span key={i} className="text-red-600">Out of stock</span>) : <span key={i} className="text-ink-300">Not sold</span>))}
              </Row>
            );
          })}
        </div>
      </div>
    </div>
  );
}
