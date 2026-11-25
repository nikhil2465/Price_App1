# PriceWise AI shopping assistant (v0.1)

A Claude-powered shopping assistant for the PriceWise price comparison app. It answers product questions, compares prices across Amazon, Flipkart, Croma, Reliance Digital, Vijay Sales, Tata CLiQ, Myntra, AJIO and Nykaa, works out the best deal for *this* shopper, flags fake discounts and risky sellers, and helps with returns and complaints.

It runs as its own small service on port 4100. The PriceWise web app proxies `/api/assistant/*` to it, and it reads prices from the PriceWise API. Without the API it runs on a bundled sample catalogue.

## What it handles

| Shopper asks | What the assistant does | Tool behind it |
|---|---|---|
| "Best phone under ₹25,000 for battery" | Searches within budget, compares the top picks, recommends one with the trade-off | `search_products`, `get_product_details`, `compare_products` |
| "Where is the iPhone 16 cheapest with my HDFC card?" | Applies only the bank offers *their* cards qualify for, exchange value, delivery deadline, priorities | `find_best_offer` |
| "Is 75% off real?" | Real saving vs what it usually sells for on that store; spots inflated MRPs and prices raised just before a sale | `check_discount` |
| "Is this seller safe?" | Risk signals: low rating, no returns, price far below other stores (counterfeit risk), slow delivery, retailer or brand's own store | `assess_seller` |
| "Buy now or wait?" | 90 day lows/highs per store, weekly trend, a clear call | `get_price_history` |
| "Can I return this? It arrived damaged" | The listing's actual return window, category rules, how to start, escalation (grievance officer, National Consumer Helpline 1915, e-Daakhil) | `get_return_policy` |
| "Do you cover Meesho?" | Lists supported stores, offers the closest help | `list_marketplaces` |
| Off-topic, OTPs or card numbers, medical questions | Polite boundary; warns never to share OTPs; facts only for health products | system prompt |

Gaps in typical comparison apps this closes: effective price instead of list price, personal bank-offer matching, fake-discount detection, seller-risk warnings, returns help, and neutrality (no paid ranking).

## Design

- **No invented numbers.** Every price, offer and spec comes from a tool. All arithmetic (effective price, discount maths, seller scores, personal ranking) is deterministic code in `src/analysis/`, unit tested. Claude decides what to look up and explains it.
- **Manual streaming tool loop** on the Messages API (`src/assistant/agent.ts`): Claude Opus 5.5, adaptive thinking, effort `medium`, server-side refusal fallback (`fallbacks: "default"`), prompt caching on the system prompt, tools and conversation. Tools run in parallel, are read-only and are validated with Zod before running. The loop is capped (default 8 rounds) and the last round forbids tools, so the shopper always gets an answer. A tool call cut off at `max_tokens` or in a refusal is never run.
- **Stateless service.** The client sends the conversation each time, so it scales horizontally. History is bounded and text-only.
- **Untrusted data.** Product titles, seller names and reviews are treated as data, never instructions. Client input is size-limited, schema-validated and stripped of control characters.

```
src/
  config.ts              env config (validated at startup)
  assistant/             system prompt, 9 tools, agent loop, Claude gateway
  analysis/              pricing, discount, seller trust, personal ranking (deterministic)
  data/                  CatalogProvider: PriceWise HTTP client (validated) + sample catalogue
  knowledge/returns.ts   returns and escalation guidance (needs policy review, see below)
  http/                  server, request validation, rate limiting, SSE
public/                  standalone demo chat UI (served at / when SERVE_DEMO_UI=true)
test/                    51 tests: analysis, tools, request handling, agent loop, HTTP client, server
```

## Run it

```bash
npm install
cp .env.example .env            # add ANTHROPIC_API_KEY
npm run dev                     # or: npm run build && node --env-file=.env dist/src/index.js
# open http://localhost:4100 for the demo UI
```

With the PriceWise app: start its API (`npm run dev` at the repo root, port 4000), set `PRICEWISE_API_URL=http://localhost:4000` here, and the app's chat widget works through its proxy.

No API key yet? `npx tsx scripts/demo-harness.mts` runs the real server, tools and catalogue with a scripted model so you can click through the UI at no cost.

Checks: `npm test`, `npm run typecheck`, `npm run check:contract` (fails if the vendored `src/domain/pricewise-types.ts` drifts from the app's `shared/types.ts`).

## API

`POST /api/assistant/chat` with `Content-Type: application/json`:

```json
{ "messages": [{ "role": "user", "content": "Is the Galaxy S25 cheaper anywhere?" }],
  "context": { "productId": "samsung-galaxy-s25-256gb", "compareIds": ["..."] } }
```

Response is `text/event-stream`, one JSON object per `data:` line:

| Event | Meaning |
|---|---|
| `{"type":"text","delta":"..."}` | Answer text (markdown) |
| `{"type":"status","tool":"check_discount","message":"Checking if the discount is real"}` | Optional progress line |
| `{"type":"products","items":[{id,title,bestPrice,bestMarketplaceId,storeCount,rating,dataSource,...}]}` | Optional product cards |
| `{"type":"done","stopReason":"end_turn","usage":{...}}` | Finished |
| `{"type":"error","code":"rate_limited","message":"..."}` | Failed; message is safe to show |

Errors before streaming use the PriceWise `ApiError` shape `{ "error": { "code", "message" } }` with 400, 401, 413, 415, 429 (with `Retry-After`) or 503. Also `GET /health` and `GET /ready`.

## Production notes

- Set the same `ASSISTANT_SHARED_SECRET` here and in the app; the app's proxy sends it as `x-assistant-key`, so only the app can call this service (and spend API credits).
- Rate limits are per shopper IP. The app's proxy sends `X-Forwarded-For`, so run this service with `TRUST_PROXY=true` behind it. The limiter is in-memory per instance: with several instances, enforce limits at the gateway or move the limiter to Redis.
- Logs are one JSON line per event with request ids and token usage per turn; message text is not logged.
- Cost control: `ASSISTANT_EFFORT`, `ASSISTANT_MAX_TOOL_ROUNDS`, `RATE_LIMIT_PER_MINUTE`, `MAX_CONCURRENT_CHATS`.
- On Bedrock, Vertex or Foundry, set `ASSISTANT_ENABLE_FALLBACKS=false` (server-side fallbacks are a Claude API feature).

## Known limits and assumptions

- `src/knowledge/returns.ts` is general guidance written without checking each store's current published policy. It always defers to the listing's own return window and tells the shopper to confirm. It needs a review by someone owning policy/legal before launch.
- Discount and seller-trust thresholds are heuristics (named constants in `src/analysis/`), not tuned on labelled data. Seller trust uses only fields the PriceWise contract has; real seller age, complaint rates or review authenticity would make it much stronger.
- Prices are only as fresh as the PriceWise API. Every offer carries `lastCheckedAt` and `dataSource`, and the assistant labels sample data.
- Not built yet: price-drop alerts, order tracking, review-authenticity analysis, image search ("find this product"), and accounts. These need user accounts and storage in the app.
- The agent loop and server are tested with a scripted model. A live run against the Claude API has not been done yet (no key in this environment).
