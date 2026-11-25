import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "../src/assistant/tools.js";
import { CatalogError, type CatalogProvider } from "../src/data/provider.js";
import { sampleCatalog, silentLogger } from "./helpers.js";

const ctx: ToolContext = { catalog: sampleCatalog(), logger: silentLogger };

test("tool definitions are valid, stable JSON Schemas with no $schema key", () => {
  const names = TOOL_DEFINITIONS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "unique names");
  for (const t of TOOL_DEFINITIONS) {
    assert.match(t.name, /^[a-z_]{1,64}$/);
    assert.equal((t.input_schema as Record<string, unknown>).type, "object");
    assert.equal("$schema" in t.input_schema, false);
    assert.equal((t.input_schema as Record<string, unknown>).additionalProperties, false);
    assert.ok(t.description && t.description.length > 40);
  }
  // Deterministic: same JSON every import (prompt-cache prefix stability).
  assert.equal(JSON.stringify(TOOL_DEFINITIONS), JSON.stringify(TOOL_DEFINITIONS.map((t) => ({ ...t }))));
});

test("search_products respects budget and returns UI cards", async () => {
  const out = await executeTool("search_products", { query: "phone", category: "smartphones", max_price: 25000 }, ctx);
  assert.equal(out.isError, undefined);
  const r = out.result as { results: { best_effective_price: number; product_id: string }[] };
  assert.ok(r.results.length >= 2);
  assert.ok(r.results.every((x) => x.best_effective_price <= 25000));
  assert.equal(out.cards?.length, r.results.length);
});

test("get_product_details includes offers, discount checks and seller risks", async () => {
  const out = await executeTool("get_product_details", { product_id: "sony-wh-1000xm5" }, ctx);
  const r = out.result as { offers: { store: string; seller_trust: string }[]; discount_checks: unknown[]; seller_risks: { store: string }[]; data_source: string };
  assert.equal(r.data_source, "sample");
  assert.equal(r.offers.length, 4);
  assert.equal(r.discount_checks.length, 4);
  assert.equal(r.offers.find((o) => o.store === "amazon")?.seller_trust, "low");
  assert.ok(r.seller_risks.some((s) => s.store === "amazon"));
});

test("unknown product is a normal 'not found' result, not an error", async () => {
  const out = await executeTool("get_product_details", { product_id: "does-not-exist" }, ctx);
  assert.equal(out.isError, undefined);
  assert.equal((out.result as { found: boolean }).found, false);
});

test("invalid input is rejected before running, with the reason", async () => {
  const bad = await executeTool("get_product_details", { product_id: "../../etc/passwd" }, ctx);
  assert.equal(bad.isError, true);
  const extra = await executeTool("search_products", { query: "tv", drop_tables: true }, ctx);
  assert.equal(extra.isError, true, "unknown keys are rejected (strict schema)");
  const unknown = await executeTool("place_order", {}, ctx);
  assert.equal(unknown.isError, true);
});

test("compare_products aligns specs and reports missing ids", async () => {
  const out = await executeTool("compare_products", { product_ids: ["oneplus-nord-ce4-128gb", "redmi-note-14-pro-256gb", "nope-123"] }, ctx);
  const r = out.result as { products: unknown[]; missing_product_ids: string[]; specs: Record<string, Record<string, string>> };
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.missing_product_ids, ["nope-123"]);
  assert.ok(r.specs.Battery?.["oneplus-nord-ce4-128gb"]);
});

test("find_best_offer applies the shopper's own card", async () => {
  const out = await executeTool("find_best_offer", { product_id: "iphone-16-128gb", cards: [{ bank: "HDFC", card_type: "credit" }] }, ctx);
  const r = out.result as { ranked_offers: { store: string; your_price: number; your_bank_offer: string | null }[] };
  const croma = r.ranked_offers.find((o) => o.store === "croma")!;
  assert.equal(croma.your_price, 71900 - 5000);
  assert.ok(croma.your_bank_offer?.includes("HDFC"));
});

test("check_discount and assess_seller can scope to one store", async () => {
  const d = await executeTool("check_discount", { product_id: "samsung-galaxy-s25-256gb", marketplace: "flipkart" }, ctx);
  const checks = (d.result as { checks: { verdict: string }[] }).checks;
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.verdict, "misleading");
  const missing = await executeTool("assess_seller", { product_id: "samsung-galaxy-s25-256gb", marketplace: "nykaa" }, ctx);
  assert.equal((missing.result as { found: boolean }).found, false);
});

test("get_return_policy uses the listing's actual return window", async () => {
  const out = await executeTool("get_return_policy", { marketplace: "nykaa", product_id: "minimalist-niacinamide-10-serum-30ml" }, ctx);
  const r = out.result as { listingReturnDays: number; listingSummary: string; escalation: string[]; disclaimer: string };
  assert.equal(r.listingReturnDays, 0);
  assert.match(r.listingSummary, /does not accept returns/);
  assert.ok(r.escalation.some((s) => s.includes("1915")));
  const needsCategory = await executeTool("get_return_policy", { marketplace: "amazon" }, ctx);
  assert.equal(needsCategory.isError, true);
});

test("get_price_history summarises trend and per-store lows", async () => {
  const out = await executeTool("get_price_history", { product_id: "redmi-note-14-pro-256gb" }, ctx);
  const r = out.result as { trend_first_30d_avg_vs_last_30d_avg: { trend: string }; per_store: { lowest: number; today: number }[]; weekly_best_price: unknown[] };
  assert.equal(r.trend_first_30d_avg_vs_last_30d_avg.trend, "falling");
  assert.ok(r.weekly_best_price.length >= 12 && r.weekly_best_price.length <= 14);
});

test("catalogue outage becomes a tool error telling the model not to guess", async () => {
  const down: CatalogProvider = {
    name: "down",
    search: async () => { throw new CatalogError("boom", true); },
    getProduct: async () => { throw new CatalogError("boom", true); },
    getPriceHistory: async () => { throw new CatalogError("boom", true); },
    compare: async () => { throw new CatalogError("boom", true); },
    listMarketplaces: async () => { throw new CatalogError("boom", true); },
  };
  const out = await executeTool("search_products", { query: "tv" }, { catalog: down, logger: silentLogger });
  assert.equal(out.isError, true);
  assert.match(JSON.stringify(out.result), /do not guess/);
});
