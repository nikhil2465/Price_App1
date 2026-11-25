import { BadgeIndianRupee, LineChart, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CategoryId } from '@shared/types';
import { CATEGORY_ICON } from '../components/ProductVisual';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, Skeleton } from '../components/States';
import { StoreBadge } from '../components/StoreBadge';
import { useCategories, useMarketplaces, useSearch } from '../lib/queries';

const POPULAR = ['iPhone 16', 'noise cancelling', 'OLED TV', 'gaming laptop', 'smartwatch', 'running shoes'];

const FEATURES = [
  {
    Icon: BadgeIndianRupee,
    title: 'The real price, not the sticker',
    body: 'We add delivery and subtract the best bank offer so you see what you actually pay at each store.',
  },
  { Icon: LineChart, title: 'Buy now or wait', body: '90 day price history across stores with a plain verdict on whether today’s price is good.' },
  { Icon: ShieldCheck, title: 'Trust beyond price', body: 'Deal score weighs seller rating, delivery speed and return window, not just the lowest number.' },
  { Icon: Sparkles, title: 'AI shopping assistant', body: 'Ask in plain words: best phone under ₹30k, which card to use, or how two models really differ.' },
];

export function HomePage() {
  const categories = useCategories();
  const markets = useMarketplaces();
  const deals = useSearch({ q: '', brands: [], marketplaces: [], sort: 'savings' });

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-deal-500/10" />
        <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-14 text-center sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">
            {markets.data?.length ?? 9} stores · one honest comparison
          </p>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Compare prices across India’s top stores.
            <br className="hidden sm:block" /> <span className="text-deal-500">Pay the real lowest price.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
            Amazon, Flipkart, Croma, Reliance Digital, Myntra and more, side by side with bank offers, delivery, returns and price history.
          </p>
          <div className="mx-auto mt-8 max-w-3xl">
            <SearchBar size="lg" autoFocus />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {POPULAR.map((p) => (
              <Link key={p} to={`/search?q=${encodeURIComponent(p)}`} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/90 hover:bg-white/20">
                {p}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-14 max-w-6xl px-4" aria-labelledby="cat-heading">
        <h2 id="cat-heading" className="sr-only">
          Browse categories
        </h2>
        <div className="grid grid-cols-2 gap-3 rounded-3xl bg-white p-4 shadow-lift sm:grid-cols-4 lg:grid-cols-8">
          {(categories.data ?? []).map((c) => {
            const Icon = CATEGORY_ICON[c.id as CategoryId];
            return (
              <Link
                key={c.id}
                to={`/search?category=${c.id}`}
                className="flex flex-col items-center gap-2 rounded-2xl p-3 text-center transition hover:bg-brand-50"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold text-ink-700">{c.label}</span>
              </Link>
            );
          })}
          {categories.isLoading && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="why-heading">
        <h2 id="why-heading" className="text-center text-2xl font-bold">
          Why shoppers trust PriceWise
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-deal-50 text-deal-700">
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-ink-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="deals-heading">
        <div className="flex items-end justify-between">
          <h2 id="deals-heading" className="text-2xl font-bold">
            Biggest price gaps today
          </h2>
          <Link to="/search?sort=savings" className="text-sm font-semibold text-brand-700 hover:underline">
            See all
          </Link>
        </div>
        <p className="mt-1 text-sm text-ink-500">Products where picking the right store saves you the most.</p>
        <div className="mt-6 space-y-4">
          {deals.isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}
          {deals.error && <ErrorState message={(deals.error as Error).message} onRetry={() => void deals.refetch()} />}
          {deals.data?.results.slice(0, 4).map((s) => <ProductCard key={s.product.id} s={s} />)}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="stores-heading">
        <h2 id="stores-heading" className="text-center text-lg font-semibold text-ink-700">
          Stores we compare
        </h2>
        <div className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-4">
          {markets.data?.map((m) => <StoreBadge key={m.id} id={m.id} />)}
        </div>
      </section>
    </>
  );
}
