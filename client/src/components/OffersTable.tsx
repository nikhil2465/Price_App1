import { Award, BadgePercent, CreditCard, ExternalLink, RotateCcw, Truck } from 'lucide-react';
import type { RankedOffer } from '@shared/types';
import { deliveryLabel, inr, timeAgo } from '../lib/format';
import { SampleTag } from './SampleDataBanner';
import { StoreBadge } from './StoreBadge';

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? 'text-deal-600' : score >= 50 ? 'text-brand-600' : 'text-ink-500';
  return (
    <div className={`text-center ${color}`} title="Deal score blends price, delivery speed, seller rating and return window">
      <div className="text-lg font-bold leading-none">{score}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-500">score</div>
    </div>
  );
}

function OfferRow({ o }: { o: RankedOffer }) {
  return (
    <li
      className={`relative grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-[1.3fr_1fr_1.4fr_1fr_auto] md:items-center ${
        o.isBestPrice ? 'border-deal-500 ring-1 ring-deal-500' : 'border-ink-100'
      } ${o.inStock ? '' : 'opacity-60'}`}
    >
      {(o.isBestPrice || o.isBestDeal) && (
        <div className="absolute -top-3 left-4 flex gap-2">
          {o.isBestPrice && (
            <span className="inline-flex items-center gap-1 rounded-full bg-deal-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              <BadgePercent size={12} aria-hidden="true" /> Lowest price
            </span>
          )}
          {o.isBestDeal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-semibold text-white">
              <Award size={12} aria-hidden="true" /> Best overall deal
            </span>
          )}
        </div>
      )}

      <div>
        <StoreBadge id={o.marketplaceId} />
        <p className="mt-1 text-xs text-ink-500">
          Sold by {o.sellerName} · {o.sellerRating.toFixed(1)}★
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-500">
          Checked {timeAgo(o.lastCheckedAt)} {o.dataSource === 'sample' && <SampleTag />}
        </p>
      </div>

      <div>
        <p className="text-sm text-ink-500">
          <span className="text-lg font-semibold text-ink-900">{inr(o.price)}</span>
          {o.mrp > o.price && <span className="ml-2 line-through">{inr(o.mrp)}</span>}
        </p>
        {o.discountPercent > 0 && <p className="text-xs font-semibold text-deal-700">{o.discountPercent}% off MRP</p>}
        {!o.inStock && <p className="text-xs font-semibold text-red-600">Out of stock</p>}
      </div>

      <ul className="space-y-1 text-xs text-ink-700">
        <li className="flex items-start gap-1.5">
          <CreditCard size={14} className="mt-0.5 shrink-0 text-ink-500" aria-hidden="true" />
          {o.bestBankOffer ? (
            <span>
              <strong className="text-deal-700">−{inr(o.bestBankOffer.discount)}</strong> {o.bestBankOffer.description}
            </span>
          ) : (
            <span className="text-ink-500">No bank offer</span>
          )}
        </li>
        <li className="flex items-center gap-1.5">
          <Truck size={14} className="shrink-0 text-ink-500" aria-hidden="true" />
          {deliveryLabel(o.deliveryDays)} · {o.deliveryFee ? `${inr(o.deliveryFee)} delivery` : 'Free delivery'}
        </li>
        <li className="flex items-center gap-1.5">
          <RotateCcw size={14} className="shrink-0 text-ink-500" aria-hidden="true" />
          {o.returnDays} day returns
          {o.emiPerMonth ? ` · EMI from ${inr(o.emiPerMonth)}/mo` : ''}
          {o.exchangeUpTo ? ` · Exchange up to ${inr(o.exchangeUpTo)}` : ''}
        </li>
      </ul>

      <div className="flex items-center justify-between gap-4 md:block md:text-right">
        {o.inStock ? (
          <>
            <div>
              <p className="text-xs font-medium text-ink-500">You pay</p>
              <p className={`text-xl font-bold ${o.isBestPrice ? 'text-deal-700' : 'text-ink-900'}`}>{inr(o.effectivePrice)}</p>
            </div>
            <ScoreRing score={o.dealScore} />
          </>
        ) : (
          <p className="text-sm font-semibold text-ink-500">Unavailable</p>
        )}
      </div>

      <a
        href={o.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold ${
          o.isBestPrice ? 'bg-deal-600 text-white hover:bg-deal-700' : 'border border-brand-500 text-brand-700 hover:bg-brand-50'
        }`}
      >
        {o.inStock ? 'Go to store' : 'Check store'} <ExternalLink size={14} aria-hidden="true" />
      </a>
    </li>
  );
}

export function OffersTable({ offers }: { offers: RankedOffer[] }) {
  return (
    <section aria-labelledby="offers-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 id="offers-heading" className="text-lg font-bold">
          Prices across {offers.length} stores
        </h2>
        <p className="text-xs text-ink-500">“You pay” = price + delivery − best single bank offer. Offers don’t stack.</p>
      </div>
      <ul className="space-y-5">
        {offers.map((o) => (
          <OfferRow key={o.marketplaceId} o={o} />
        ))}
      </ul>
    </section>
  );
}
