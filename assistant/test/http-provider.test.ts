import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpCatalogProvider } from "../src/data/http-provider.js";
import { CatalogError } from "../src/data/provider.js";
import { sampleCatalog, silentLogger } from "./helpers.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function provider(responses: (Response | Error)[], seen: string[] = []) {
  const fetchImpl = (async (url: URL | RequestInfo) => {
    seen.push(String(url));
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return new HttpCatalogProvider({ baseUrl: "http://pricewise.test:4000", timeoutMs: 1000, logger: silentLogger, fetchImpl });
}

test("maps query params onto the PriceWise search endpoint and validates the payload", async () => {
  const body = await sampleCatalog().search({ query: "phone" });
  const seen: string[] = [];
  const p = provider([json(200, body)], seen);
  const res = await p.search({ query: "phone", maxPrice: 25000, marketplaces: ["amazon", "flipkart"], sort: "price-asc", limit: 2 });
  assert.equal(res.results.length, 2);
  const u = new URL(seen[0]!);
  assert.equal(u.pathname, "/api/search");
  assert.equal(u.searchParams.get("maxPrice"), "25000");
  assert.equal(u.searchParams.get("marketplaces"), "amazon,flipkart");
  assert.equal(u.searchParams.get("sort"), "price-asc");
});

test("404 resolves null; invalid ids never reach the network", async () => {
  const seen: string[] = [];
  const p = provider([json(404, { error: { code: "not_found", message: "x" } })], seen);
  assert.equal(await p.getProduct("missing-id"), null);
  assert.equal(await p.getProduct("../admin"), null);
  assert.equal(seen.length, 1);
});

test("retries once on 5xx / network errors, then succeeds", async () => {
  const detail = await sampleCatalog().getProduct("iphone-16-128gb");
  const p = provider([json(503, {}), json(200, detail)]);
  const d = await p.getProduct("iphone-16-128gb");
  assert.equal(d?.product.id, "iphone-16-128gb");
  const p2 = provider([new TypeError("fetch failed"), json(200, [])]);
  assert.deepEqual(await p2.listMarketplaces(), []);
});

test("gives up after retries with a retryable CatalogError; 4xx is not retried", async () => {
  await assert.rejects(provider([json(500, {}), json(502, {})]).getProduct("a"), (e: unknown) => e instanceof CatalogError && e.retryable);
  const seen: string[] = [];
  await assert.rejects(provider([json(400, {})], seen).getProduct("a"), (e: unknown) => e instanceof CatalogError && !e.retryable);
  assert.equal(seen.length, 1);
});

test("a malformed payload is rejected, never passed to the model", async () => {
  const p = provider([json(200, { product: { id: "x" }, offers: "nope" })]);
  await assert.rejects(p.getProduct("x"), CatalogError);
});
