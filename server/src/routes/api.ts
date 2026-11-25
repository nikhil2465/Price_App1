import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { CategoryId, Marketplace } from '../../../shared/types.js';
import { CATALOG, CATEGORIES, getCatalogEntry } from '../data/catalog.js';
import { MARKETPLACES, isMarketplaceId } from '../data/marketplaces.js';
import { HttpError } from '../lib/errors.js';
import type { OfferService } from '../services/offerService.js';
import type { SearchService } from '../services/searchService.js';

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
const PRODUCT_ID = z.string().regex(/^[a-z0-9-]{1,80}$/, 'Invalid product id');

const csv = (max: number) =>
  z
    .string()
    .max(1000)
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, max) : undefined));

const SearchQuery = z.object({
  q: z.string().trim().max(120).default(''),
  category: z.enum(CATEGORY_IDS).optional(),
  brand: csv(20),
  minPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
  marketplaces: csv(20).refine((v) => !v || v.every(isMarketplaceId), 'Unknown marketplace'),
  sort: z.enum(['relevance', 'price-asc', 'price-desc', 'savings', 'rating']).default('relevance'),
  limit: z.coerce.number().int().min(1).max(100).default(48),
});

const HistoryQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });
const CompareQuery = z.object({
  ids: z
    .string()
    .max(500)
    .transform((v) => [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(PRODUCT_ID).min(1).max(4)),
});

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(h(req, res)).catch(next);
};

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new HttpError(400, 'invalid_request', r.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; '));
  }
  return r.data;
}

function requireProduct(id: unknown) {
  const pid = parse(PRODUCT_ID, id);
  const entry = getCatalogEntry(pid);
  if (!entry) throw new HttpError(404, 'not_found', 'Product not found');
  return entry;
}

export function apiRouter(deps: { offers: OfferService; search: SearchService }): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ status: 'ok', products: CATALOG.length });
  });

  r.get('/marketplaces', (_req, res) => {
    const list: Marketplace[] = MARKETPLACES.map((m) => ({ ...m, liveEnabled: deps.offers.isLiveEnabled(m.id) }));
    res.set('Cache-Control', 'public, max-age=300').json(list);
  });

  r.get('/categories', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300').json(CATEGORIES);
  });

  r.get(
    '/search',
    wrap(async (req, res) => {
      const q = parse(SearchQuery, req.query);
      if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
        throw new HttpError(400, 'invalid_request', 'minPrice must be less than or equal to maxPrice');
      }
      const out = await deps.search.search({
        q: q.q,
        category: q.category,
        brands: q.brand,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        marketplaces: q.marketplaces?.filter(isMarketplaceId),
        sort: q.sort,
        limit: q.limit,
      });
      res.set('Cache-Control', 'private, max-age=60').json(out);
    }),
  );

  r.get(
    '/products/:id',
    wrap(async (req, res) => {
      const entry = requireProduct(req.params.id);
      res.set('Cache-Control', 'private, max-age=60').json(await deps.offers.detail(entry));
    }),
  );

  r.get(
    '/products/:id/history',
    wrap((req, res) => {
      const entry = requireProduct(req.params.id);
      const { days } = parse(HistoryQuery, req.query);
      res.set('Cache-Control', 'private, max-age=300').json(deps.offers.history(entry, days));
    }),
  );

  r.get(
    '/compare',
    wrap(async (req, res) => {
      const { ids } = parse(CompareQuery, req.query);
      const entries = ids.map((id) => {
        const e = getCatalogEntry(id);
        if (!e) throw new HttpError(404, 'not_found', `Product not found: ${id}`);
        return e;
      });
      res.set('Cache-Control', 'private, max-age=60').json(await Promise.all(entries.map((e) => deps.offers.detail(e))));
    }),
  );

  return r;
}
