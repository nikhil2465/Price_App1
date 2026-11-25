# PriceWise

Compare what a product really costs across Indian stores (Amazon, Flipkart, Croma, Reliance Digital, Vijay Sales, Tata CLiQ, Myntra, AJIO, Nykaa), side by side, in a comparison flow similar to insurance aggregators.

> **All prices in this version are sample data.** Every offer carries `dataSource: "sample"` and the UI shows a "Sample" tag and a site-wide banner. Live prices replace sample rows store by store once official API credentials and product IDs are added (see below).

## What it does

- **Search and filters**: by keyword, category, store, brand and price ("you pay" price). Sort by relevance, price, biggest savings or rating.
- **Real price, not sticker price**: `effective price = selling price + delivery − the single best bank offer` (bank offers don't stack).
- **Best deal highlight**: "Lowest price" plus a "Best overall deal" badge from a transparent deal score (price 60%, delivery speed 15%, seller rating 15%, return window 10%).
- **Buy now or wait**: 30/90/180 day price history per store, with a verdict based on the 90 day low and average.
- **Side by side compare**: up to 4 products from the same category: best price, verdict, rating, every spec and the price at each store.
- **AI assistant widget**: streams answers from the assistant service (built in a separate project thread) and passes the product or comparison on screen as context.

## Run it

```bash
npm install
cp server/.env.example server/.env   # optional, defaults work
npm run dev                          # API on :4000, web on :5173
```

Open http://localhost:5173. Production: `npm run build && NODE_ENV=production npm start` serves the API and the built web app from one process on `PORT`.

Tests: `npm test` (server: ranking, insight, SigV4 signing, Amazon adapter, API routes and validation).

## Architecture

```
shared/types.ts        Data contract shared by server, client and the AI assistant service
server/                Express + TypeScript API
  providers/sample.ts    Deterministic sample offers and price history
  providers/amazon.ts    Amazon PA-API 5.0 GetItems adapter (SigV4)
  providers/flipkart.ts  Flipkart Affiliate API product lookup adapter
  services/              Offer collection (live with sample fallback, cache, 4s timeout), ranking, insight, search
  routes/api.ts          Validated REST endpoints (zod)
  routes/assistantProxy  Streams /api/assistant/* to ASSISTANT_URL
client/                React 19 + Vite + Tailwind 4 + TanStack Query + Recharts
```

### API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/search?q=&category=&brand=&minPrice=&maxPrice=&marketplaces=&sort=&limit=` | `SearchResponse` |
| GET | `/api/products/:id` | `ProductDetail` (ranked offers + insight) |
| GET | `/api/products/:id/history?days=90` | `PricePoint[]` |
| GET | `/api/compare?ids=a,b` (max 4) | `ProductDetail[]` |
| GET | `/api/marketplaces`, `/api/categories`, `/api/health` | metadata |
| POST | `/api/assistant/chat` | proxied SSE stream: `data: {"type":"text","delta":"..."}` … `{"type":"done"}` |

Security: helmet headers, CORS allow-list, rate limits (300/min API, 20/min assistant), 64 KB body limit, strict input validation, credentials only from env and never sent to the browser.

## Going live

1. **Amazon**: join Amazon Associates India, get PA-API keys, set `AMAZON_PAAPI_*` in `server/.env`, and add `externalIds: { amazon: "<ASIN>" }` to products in `server/src/data/catalog.ts`. New PA-API accounts are limited to about 1 request per second, and keep access only with qualifying sales, so offers are cached (`OFFER_CACHE_TTL_SECONDS`). Amazon has been moving PA-API from `Offers` to `OffersV2` resources; check the current docs before launch.
2. **Flipkart**: join the Flipkart Affiliate programme, set `FLIPKART_AFFILIATE_ID` / `FLIPKART_AFFILIATE_TOKEN`, add `externalIds: { flipkart: "<FSN>" }`.
3. **Other stores** have no public price API. The lawful route is a partner product feed through an Indian affiliate network (for example Cuelinks, EarnKaro or Admitad), added as another `LiveOfferProvider`. Scraping is deliberately not implemented because it breaks store terms.

Both live adapters are written against the published API shapes and unit tested with mocked responses, but **have not been run against real credentials**.

## Known limits of this first version

- Catalog is 26 hand-picked sample products; prices are approximate and not live.
- Price history is synthetic. Real history needs a database (e.g. Postgres) and a scheduled job that records live prices.
- Store links open a search on the store for the product title, not a specific listing, until live product IDs exist. Some store search URLs (Croma, Reliance Digital, Vijay Sales) are best guesses.
- No accounts, price-drop alerts or wishlists yet.
- Bank offers come from sample data; PA-API and the Flipkart API don't return them.
