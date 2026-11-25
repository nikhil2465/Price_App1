import type { CategoryId, Marketplace, MarketplaceId } from '../../../shared/types.js';

const ELECTRONICS: CategoryId[] = [
  'smartphones',
  'laptops',
  'headphones',
  'televisions',
  'smartwatches',
  'appliances',
];

/** Static marketplace metadata. `liveEnabled` is filled in at runtime from provider config. */
export const MARKETPLACES: Omit<Marketplace, 'liveEnabled'>[] = [
  {
    id: 'amazon',
    name: 'Amazon',
    color: '#FF9900',
    integration: 'Amazon Product Advertising API 5.0 (Associates India)',
    categories: [...ELECTRONICS, 'fashion', 'beauty'],
  },
  {
    id: 'flipkart',
    name: 'Flipkart',
    color: '#2874F0',
    integration: 'Flipkart Affiliate API',
    categories: [...ELECTRONICS, 'fashion', 'beauty'],
  },
  {
    id: 'croma',
    name: 'Croma',
    color: '#12DAA8',
    integration: 'Partner product feed (affiliate network)',
    categories: ELECTRONICS,
  },
  {
    id: 'reliance-digital',
    name: 'Reliance Digital',
    color: '#E42529',
    integration: 'Partner product feed (affiliate network)',
    categories: ELECTRONICS,
  },
  {
    id: 'vijay-sales',
    name: 'Vijay Sales',
    color: '#ED1C24',
    integration: 'Partner product feed (affiliate network)',
    categories: ELECTRONICS,
  },
  {
    id: 'tata-cliq',
    name: 'Tata CLiQ',
    color: '#DA1C5C',
    integration: 'Partner product feed (affiliate network)',
    categories: [...ELECTRONICS, 'fashion'],
  },
  {
    id: 'myntra',
    name: 'Myntra',
    color: '#FF3F6C',
    integration: 'Partner product feed (affiliate network)',
    categories: ['fashion', 'beauty'],
  },
  {
    id: 'ajio',
    name: 'AJIO',
    color: '#2C4152',
    integration: 'Partner product feed (affiliate network)',
    categories: ['fashion'],
  },
  {
    id: 'nykaa',
    name: 'Nykaa',
    color: '#FC2779',
    integration: 'Partner product feed (affiliate network)',
    categories: ['beauty'],
  },
];

export const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id) as MarketplaceId[];

export function isMarketplaceId(value: string): value is MarketplaceId {
  return (MARKETPLACE_IDS as string[]).includes(value);
}

export function marketplacesForCategory(category: CategoryId): MarketplaceId[] {
  return MARKETPLACES.filter((m) => m.categories.includes(category)).map((m) => m.id);
}
