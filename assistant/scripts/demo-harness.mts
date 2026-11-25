// Dev-only harness: runs the real server, tools and catalogue with a scripted
// model (no API key, no spend) so the UI and the app's proxy can be exercised
// end to end. Usage: npx tsx scripts/demo-harness.mts  (PRICEWISE_API_URL optional)
import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { createServer } from "../src/http/server.ts";
import { TokenBucketLimiter } from "../src/http/rate-limit.ts";
import { HttpCatalogProvider } from "../src/data/http-provider.ts";
import { SampleCatalogProvider } from "../src/data/sample-provider.ts";
import type { ModelGateway, TurnParams } from "../src/assistant/gateway.ts";

const config = loadConfig();
const logger = createLogger("info", { service: "demo-harness" });
const catalog = config.PRICEWISE_API_URL
  ? new HttpCatalogProvider({ baseUrl: config.PRICEWISE_API_URL, timeoutMs: 5000, logger })
  : new SampleCatalogProvider();

const m = (content: unknown[], stop: string) =>
  ({ id: "msg_demo", type: "message", role: "assistant", model: "scripted", content, stop_reason: stop, stop_sequence: null, stop_details: null,
     usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) as unknown as Anthropic.Beta.BetaMessage;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Scripted "model": searches, then fetches details for the top hit, then writes an answer from the real tool data. */
const gateway: ModelGateway = {
  async streamTurn(params: TurnParams, onText) {
    const last = params.messages.at(-1)!;
    const results = Array.isArray(last.content) ? (last.content as { type: string; content?: string }[]).filter((b) => b.type === "tool_result") : [];
    const say = async (t: string) => { for (const w of t.split(/(?<= )/)) { onText(w); await new Promise((r) => setTimeout(r, 12)); } };
    if (results.length === 0) {
      const q = typeof last.content === "string" ? last.content : (last.content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).at(-1) ?? "";
      await say("Let me compare prices across stores. ");
      return m([{ type: "text", text: "Let me compare prices across stores. " }, { type: "tool_use", id: "tu_s", name: "search_products", input: { query: q.slice(0, 80) || "phone", limit: 4 } }], "tool_use");
    }
    const data = JSON.parse(results[0]!.content ?? "{}");
    if (data.results) {
      const top = data.results[0];
      if (!top) { const t = "I couldn't find a matching product in the catalogue. Try a brand or model name."; await say(t); return m([{ type: "text", text: t }], "end_turn"); }
      return m([{ type: "tool_use", id: "tu_d", name: "get_product_details", input: { product_id: top.product_id } }], "tool_use");
    }
    const offers = (data.offers ?? []).filter((o: any) => o.in_stock);
    const best = offers.reduce((a: any, b: any) => (b.effective_price_with_best_bank_offer < a.effective_price_with_best_bank_offer ? b : a), offers[0]);
    const checks = Object.fromEntries((data.discount_checks ?? []).map((c: any) => [c.store, c]));
    const rows = offers.slice(0, 5).map((o: any) => `| ${o.store} | ${inr(o.price)} | ${inr(o.effective_price_with_best_bank_offer)} | ${o.delivery_days} d | ${o.return_days} d | ${o.seller_trust} | ${checks[o.store]?.verdict ?? "-"} |`).join("\n");
    const text = `**Best deal: ${best.store} at ${inr(best.effective_price_with_best_bank_offer)}** for the ${data.product.title}${best.best_bank_offer ? `, with ${best.best_bank_offer.split(" (")[0]}` : ""}.\n\n` +
      `| Store | Price | With best bank offer | Delivery | Returns | Seller trust | Discount check |\n|---|---|---|---|---|---|---|\n${rows}\n\n` +
      `- 90 day view: ${data.price_insight_90d.advice}\n- ${checks[best.store]?.reasons?.[0] ?? ""}\n\n` +
      (data.data_source === "sample" ? "_These are sample prices, not live prices._ " : "") + "(Scripted demo answer: the real assistant writes this with Claude.)";
    await say(text);
    return m([{ type: "text", text }], "end_turn");
  },
};

const server = createServer({ config, logger, gateway, catalog, limiter: new TokenBucketLimiter(config.RATE_LIMIT_PER_MINUTE) });
server.listen(config.PORT, config.HOST, () => logger.info("demo_harness_listening", { port: config.PORT, catalog: catalog.name }));
