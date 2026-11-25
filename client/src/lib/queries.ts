import { useQuery } from '@tanstack/react-query';
import type { Marketplace, MarketplaceId } from '@shared/types';
import { api, type SearchFilters } from './api';

export function useMarketplaces() {
  return useQuery({ queryKey: ['marketplaces'], queryFn: ({ signal }) => api.marketplaces(signal), staleTime: 5 * 60_000 });
}

export function useMarketplaceMap(): Map<MarketplaceId, Marketplace> {
  const { data } = useMarketplaces();
  return new Map((data ?? []).map((m) => [m.id, m]));
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal), staleTime: 5 * 60_000 });
}

export function useSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: ['search', filters],
    queryFn: ({ signal }) => api.search(filters, signal),
    placeholderData: (prev) => prev,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({ queryKey: ['product', id], queryFn: ({ signal }) => api.product(id!, signal), enabled: Boolean(id) });
}

export function useHistory(id: string | undefined, days: number) {
  return useQuery({ queryKey: ['history', id, days], queryFn: ({ signal }) => api.history(id!, days, signal), enabled: Boolean(id) });
}

export function useCompare(ids: string[]) {
  return useQuery({ queryKey: ['compare', ids], queryFn: ({ signal }) => api.compare(ids, signal), enabled: ids.length > 0 });
}
