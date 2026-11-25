import type {
  ApiError,
  CategoryId,
  Marketplace,
  PricePoint,
  ProductDetail,
  SearchResponse,
  SortKey,
} from '@shared/types';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'network_error', 'Could not reach PriceWise. Check your connection and try again.');
  }
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(res.status, body?.error.code ?? 'http_error', body?.error.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface SearchFilters {
  q: string;
  category?: CategoryId;
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  marketplaces: string[];
  sort: SortKey;
}

export function searchParamsFromFilters(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.category) p.set('category', f.category);
  if (f.brands.length) p.set('brand', f.brands.join(','));
  if (f.minPrice !== undefined) p.set('minPrice', String(f.minPrice));
  if (f.maxPrice !== undefined) p.set('maxPrice', String(f.maxPrice));
  if (f.marketplaces.length) p.set('marketplaces', f.marketplaces.join(','));
  if (f.sort !== 'relevance') p.set('sort', f.sort);
  return p;
}

export const api = {
  marketplaces: (signal?: AbortSignal) => getJson<Marketplace[]>('/api/marketplaces', signal),
  categories: (signal?: AbortSignal) => getJson<{ id: CategoryId; label: string }[]>('/api/categories', signal),
  search: (f: SearchFilters, signal?: AbortSignal) => getJson<SearchResponse>(`/api/search?${searchParamsFromFilters(f)}`, signal),
  product: (id: string, signal?: AbortSignal) => getJson<ProductDetail>(`/api/products/${encodeURIComponent(id)}`, signal),
  history: (id: string, days = 90, signal?: AbortSignal) =>
    getJson<PricePoint[]>(`/api/products/${encodeURIComponent(id)}/history?days=${days}`, signal),
  compare: (ids: string[], signal?: AbortSignal) =>
    getJson<ProductDetail[]>(`/api/compare?ids=${ids.map(encodeURIComponent).join(',')}`, signal),
};
