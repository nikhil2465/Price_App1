/**
 * Shared domain contract for PriceWise.
 *
 * Used by the API server (server/), the web client (client/) and any
 * external service (e.g. the AI assistant) that consumes the HTTP API.
 * All money values are whole Indian rupees (INR) as integers.
 */

export type MarketplaceId =
  | 'amazon'
  | 'flipkart'
  | 'croma'
  | 'reliance-digital'
  | 'vijay-sales'
  | 'tata-cliq'
  | 'myntra'
  | 'ajio'
  | 'nykaa';

/** Where an offer's numbers came from. `sample` must always be shown to users as sample data. */
export type DataSource = 'live' | 'sample';

export type CategoryId =
  | 'smartphones'
  | 'laptops'
  | 'headphones'
  | 'televisions'
  | 'smartwatches'
  | 'appliances'
  | 'fashion'
  | 'beauty';

export interface Marketplace {
  id: MarketplaceId;
  name: string;
  /** Brand accent used for chips/badges in the UI. */
  color: string;
  /** Official integration route, e.g. "Amazon Product Advertising API 5.0". */
  integration: string;
  /** True when credentials for the official API are configured on the server. */
  liveEnabled: boolean;
  categories: CategoryId[];
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  category: CategoryId;
  image: string;
  /** Normalised key specs, displayed as comparison rows. */
  specs: Record<string, string>;
  /** Aggregate rating across marketplaces (0 to 5). */
  rating: number;
  ratingCount: number;
  /** Search keywords / aliases used for matching the same product across stores. */
  keywords: string[];
  /**
   * Store-specific identifiers used by live adapters, e.g. { amazon: "<ASIN>", flipkart: "<FSN>" }.
   * Absent means the store is served from sample data for this product.
   */
  externalIds?: Partial<Record<MarketplaceId, string>>;
}

export interface BankOffer {
  bank: string;
  cardType: 'credit' | 'debit' | 'any';
  description: string;
  /** Flat instant discount in INR this offer gives on this offer's price. */
  discount: number;
}

export interface Offer {
  productId: string;
  marketplaceId: MarketplaceId;
  /** Selling price before bank offers. */
  price: number;
  /** Maximum retail price. */
  mrp: number;
  inStock: boolean;
  deliveryDays: number;
  deliveryFee: number;
  sellerName: string;
  /** Seller rating 0 to 5. */
  sellerRating: number;
  returnDays: number;
  /** Lowest no-cost/standard EMI per month, if available. */
  emiPerMonth: number | null;
  bankOffers: BankOffer[];
  /** Max exchange value offered for an old device, if any. */
  exchangeUpTo: number | null;
  /** Outbound link (affiliate-tagged when live). */
  url: string;
  lastCheckedAt: string; // ISO 8601
  dataSource: DataSource;
}

/** Offer plus computed fields the server adds. */
export interface RankedOffer extends Offer {
  /** price + deliveryFee - best single bank discount. */
  effectivePrice: number;
  bestBankOffer: BankOffer | null;
  discountPercent: number;
  /** 0 to 100 composite of price, delivery, seller trust and returns. */
  dealScore: number;
  isBestPrice: boolean;
  isBestDeal: boolean;
}

export interface PricePoint {
  date: string; // YYYY-MM-DD
  marketplaceId: MarketplaceId;
  price: number;
}

export interface PriceInsight {
  lowest90d: number;
  highest90d: number;
  average90d: number;
  /** Where today's best price sits: 'great' near the 90 day low, 'fair', or 'high'. */
  verdict: 'great' | 'fair' | 'high';
  /** Plain language advice, e.g. "Buy now: 4% above the 90 day low." */
  advice: string;
}

export interface ProductSummary {
  product: Product;
  bestPrice: number;
  bestMarketplaceId: MarketplaceId;
  highestPrice: number;
  storeCount: number;
  /** Savings vs the most expensive store, INR. */
  maxSavings: number;
  dataSource: DataSource;
}

export interface ProductDetail {
  product: Product;
  offers: RankedOffer[];
  insight: PriceInsight;
  dataSource: DataSource;
}

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'savings' | 'rating';

export interface SearchResponse {
  query: string;
  total: number;
  results: ProductSummary[];
  facets: {
    brands: { value: string; count: number }[];
    categories: { value: CategoryId; count: number }[];
    priceRange: { min: number; max: number };
  };
}

export interface ApiError {
  error: { code: string; message: string };
}
