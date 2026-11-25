import { z } from "zod";

/**
 * Runtime validation of PriceWise API responses. The assistant treats the API
 * as a separate service: a malformed payload becomes a CatalogError, never a
 * crash or a silently wrong price. Unknown extra fields are allowed so the app
 * can add fields without breaking the assistant.
 */

const MarketplaceIdSchema = z.enum([
  "amazon",
  "flipkart",
  "croma",
  "reliance-digital",
  "vijay-sales",
  "tata-cliq",
  "myntra",
  "ajio",
  "nykaa",
]);
const CategoryIdSchema = z.enum([
  "smartphones",
  "laptops",
  "headphones",
  "televisions",
  "smartwatches",
  "appliances",
  "fashion",
  "beauty",
]);
const DataSourceSchema = z.enum(["live", "sample"]);
const Money = z.number().finite().nonnegative();

export const ProductSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  brand: z.string(),
  category: CategoryIdSchema,
  image: z.string(),
  specs: z.record(z.string(), z.string()),
  rating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  keywords: z.array(z.string()),
});

const BankOfferSchema = z.looseObject({
  bank: z.string(),
  cardType: z.enum(["credit", "debit", "any"]),
  description: z.string(),
  discount: Money,
});

export const RankedOfferSchema = z.looseObject({
  productId: z.string(),
  marketplaceId: MarketplaceIdSchema,
  price: Money,
  mrp: Money,
  inStock: z.boolean(),
  deliveryDays: z.number().int().nonnegative(),
  deliveryFee: Money,
  sellerName: z.string(),
  sellerRating: z.number().min(0).max(5),
  returnDays: z.number().int().nonnegative(),
  emiPerMonth: Money.nullable(),
  bankOffers: z.array(BankOfferSchema),
  exchangeUpTo: Money.nullable(),
  url: z.string(),
  lastCheckedAt: z.string(),
  dataSource: DataSourceSchema,
  effectivePrice: z.number().finite(),
  bestBankOffer: BankOfferSchema.nullable(),
  discountPercent: z.number().finite(),
  dealScore: z.number().finite(),
  isBestPrice: z.boolean(),
  isBestDeal: z.boolean(),
});

export const PricePointSchema = z.looseObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marketplaceId: MarketplaceIdSchema,
  price: Money,
});

const PriceInsightSchema = z.looseObject({
  lowest90d: Money,
  highest90d: Money,
  average90d: Money,
  verdict: z.enum(["great", "fair", "high"]),
  advice: z.string(),
});

export const ProductDetailSchema = z.looseObject({
  product: ProductSchema,
  offers: z.array(RankedOfferSchema),
  insight: PriceInsightSchema,
  dataSource: DataSourceSchema,
});

const ProductSummarySchema = z.looseObject({
  product: ProductSchema,
  bestPrice: Money,
  bestMarketplaceId: MarketplaceIdSchema,
  highestPrice: Money,
  storeCount: z.number().int().nonnegative(),
  maxSavings: z.number().finite(),
  dataSource: DataSourceSchema,
});

export const SearchResponseSchema = z.looseObject({
  query: z.string(),
  total: z.number().int().nonnegative(),
  results: z.array(ProductSummarySchema),
  facets: z.looseObject({
    brands: z.array(z.looseObject({ value: z.string(), count: z.number() })),
    categories: z.array(z.looseObject({ value: CategoryIdSchema, count: z.number() })),
    priceRange: z.looseObject({ min: z.number(), max: z.number() }),
  }),
});

export const MarketplaceSchema = z.looseObject({
  id: MarketplaceIdSchema,
  name: z.string(),
  color: z.string(),
  integration: z.string(),
  liveEnabled: z.boolean(),
  categories: z.array(CategoryIdSchema),
});

export { MarketplaceIdSchema, CategoryIdSchema };
