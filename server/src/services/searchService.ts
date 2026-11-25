import type { CategoryId, MarketplaceId, ProductSummary, SearchResponse, SortKey } from '../../../shared/types.js';
import { CATALOG, type CatalogEntry } from '../data/catalog.js';
import type { OfferService } from './offerService.js';

export interface SearchParams {
  q: string;
  category?: CategoryId;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  marketplaces?: MarketplaceId[];
  sort: SortKey;
  limit: number;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple relevance: every query token must appear in title/brand/keywords/category; title/brand hits weigh more. */
export function relevance(entry: CatalogEntry, q: string): number {
  const tokens = normalise(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return 1;
  const title = normalise(entry.title);
  const brand = normalise(entry.brand);
  const keywords = normalise(entry.keywords.join(' '));
  const category = normalise(entry.category);
  let score = 0;
  for (const t of tokens) {
    const inTitle = title.includes(t);
    const inBrand = brand.includes(t);
    const inKeywords = keywords.includes(t);
    const inCategory = category.includes(t) || (t.length > 3 && category.startsWith(t.slice(0, -1)));
    if (!inTitle && !inBrand && !inKeywords && !inCategory) return 0;
    score += (inTitle ? 3 : 0) + (inBrand ? 2 : 0) + (inKeywords ? 2 : 0) + (inCategory ? 1 : 0);
  }
  // exact alias match (e.g. "iphone 16") is a strong signal
  if (entry.keywords.map(normalise).includes(normalise(q))) score += 5;
  return score;
}

export class SearchService {
  constructor(private readonly offers: OfferService) {}

  async search(p: SearchParams): Promise<SearchResponse> {
    const matched = CATALOG.map((e) => ({ e, score: relevance(e, p.q) }))
      .filter((m) => m.score > 0)
      .filter((m) => !p.category || m.e.category === p.category);

    // Facets are computed before brand/price filters so the user can always widen the search again.
    const summaries = (
      await Promise.all(matched.map(async (m) => ({ score: m.score, s: await this.offers.summary(m.e, p.marketplaces) })))
    ).filter((x): x is { score: number; s: ProductSummary } => x.s !== null);

    const brandCounts = new Map<string, number>();
    const categoryCounts = new Map<CategoryId, number>();
    let minP = Number.POSITIVE_INFINITY;
    let maxP = 0;
    for (const { s } of summaries) {
      brandCounts.set(s.product.brand, (brandCounts.get(s.product.brand) ?? 0) + 1);
      categoryCounts.set(s.product.category, (categoryCounts.get(s.product.category) ?? 0) + 1);
      minP = Math.min(minP, s.bestPrice);
      maxP = Math.max(maxP, s.bestPrice);
    }

    const brandSet = p.brands?.length ? new Set(p.brands.map((b) => b.toLowerCase())) : null;
    const filtered = summaries.filter(({ s }) => {
      if (brandSet && !brandSet.has(s.product.brand.toLowerCase())) return false;
      if (p.minPrice !== undefined && s.bestPrice < p.minPrice) return false;
      if (p.maxPrice !== undefined && s.bestPrice > p.maxPrice) return false;
      return true;
    });

    const cmp: Record<SortKey, (a: (typeof filtered)[number], b: (typeof filtered)[number]) => number> = {
      relevance: (a, b) => b.score - a.score || b.s.maxSavings - a.s.maxSavings,
      'price-asc': (a, b) => a.s.bestPrice - b.s.bestPrice,
      'price-desc': (a, b) => b.s.bestPrice - a.s.bestPrice,
      savings: (a, b) => b.s.maxSavings - a.s.maxSavings,
      rating: (a, b) => b.s.product.rating - a.s.product.rating || b.s.product.ratingCount - a.s.product.ratingCount,
    };
    filtered.sort(cmp[p.sort]);

    return {
      query: p.q,
      total: filtered.length,
      results: filtered.slice(0, p.limit).map((x) => x.s),
      facets: {
        brands: [...brandCounts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
        categories: [...categoryCounts].map(([value, count]) => ({ value, count })),
        priceRange: { min: Number.isFinite(minP) ? minP : 0, max: maxP },
      },
    };
  }
}
