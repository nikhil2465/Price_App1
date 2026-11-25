import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/http/server.js";
import { TokenBucketLimiter } from "../src/http/rate-limit.js";
import { ScriptedGateway, msg, sampleCatalog, silentLogger, text, toolUse } from "./helpers.js";

async function start(env: Record<string, string>, steps: ConstructorParameters<typeof ScriptedGateway>[0] = []) {
  const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "error", ...env });
  const gateway = new ScriptedGateway(steps);
  const server = createServer({ config, logger: silentLogger, gateway, catalog: sampleCatalog(), limiter: new TokenBucketLimiter(config.RATE_LIMIT_PER_MINUTE) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  after(() => new Promise<void>((r) => server.close(() => r())));
  return { base, gateway };
}

const chat = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

function parseSse(raw: string): { type: string; [k: string]: unknown }[] {
  return raw
    .split("\n\n")
    .map((chunk) => chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join(""))
    .filter(Boolean)
    .map((d) => JSON.parse(d));
}

test("streams text deltas then done, in the widget's SSE contract", async () => {
  const { base } = await start({}, [
    msg([toolUse("t1", "get_product_details", { product_id: "iphone-16-128gb" })], "tool_use"),
    msg([text("Flipkart is cheapest "), text("today.")], "end_turn"),
  ]);
  const res = await chat(base, { messages: [{ role: "user", content: "where is iphone 16 cheapest?" }], context: { productId: "iphone-16-128gb" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  const events = parseSse(await res.text());
  assert.deepEqual(events.filter((e) => e.type === "text").map((e) => e.delta).join(""), "Flipkart is cheapest today.");
  assert.equal(events.at(-1)!.type, "done");
  assert.ok(events.some((e) => e.type === "status"));
});

test("rejects bad requests with the PriceWise ApiError shape", async () => {
  const { base } = await start({});
  const r1 = await chat(base, { messages: [] });
  assert.equal(r1.status, 400);
  const b1 = (await r1.json()) as { error: { code: string; message: string } };
  assert.equal(b1.error.code, "invalid_request");

  const r2 = await fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  assert.equal(r2.status, 400);

  const r3 = await fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" });
  assert.equal(r3.status, 415);

  const r4 = await fetch(`${base}/api/assistant/chat`, { method: "GET" });
  assert.equal(r4.status, 405);

  const big = await chat(base, { messages: [{ role: "user", content: "x".repeat(300 * 1024) }] });
  assert.equal(big.status, 413);
});

test("shared secret is enforced when configured", async () => {
  const secret = "s3cret-value-for-tests-only";
  const { base } = await start({ ASSISTANT_SHARED_SECRET: secret }, [msg([text("ok")], "end_turn")]);
  assert.equal((await chat(base, { messages: [{ role: "user", content: "hi" }] })).status, 401);
  assert.equal((await chat(base, { messages: [{ role: "user", content: "hi" }] }, { "x-assistant-key": "wrong" })).status, 401);
  const ok = await chat(base, { messages: [{ role: "user", content: "hi" }] }, { "x-assistant-key": secret });
  assert.equal(ok.status, 200);
  await ok.text();
});

test("rate limit returns 429 with retry-after", async () => {
  const { base } = await start({ RATE_LIMIT_PER_MINUTE: "1" }, [msg([text("ok")], "end_turn")]);
  const first = await chat(base, { messages: [{ role: "user", content: "hi" }] });
  await first.text();
  const second = await chat(base, { messages: [{ role: "user", content: "hi again" }] });
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get("retry-after")) > 0);
});

test("CORS: unknown origins are refused, allowed origins get headers", async () => {
  const { base } = await start({ CORS_ALLOWED_ORIGINS: "https://app.pricewise.example" });
  const bad = await fetch(`${base}/api/assistant/chat`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
  assert.equal(bad.status, 403);
  const good = await fetch(`${base}/api/assistant/chat`, { method: "OPTIONS", headers: { origin: "https://app.pricewise.example" } });
  assert.equal(good.status, 204);
  assert.equal(good.headers.get("access-control-allow-origin"), "https://app.pricewise.example");
});

test("health, readiness and the demo UI with a strict CSP", async () => {
  const { base } = await start({});
  const h = await fetch(`${base}/health`);
  assert.equal(h.status, 200);
  assert.equal(((await h.json()) as { catalog: string }).catalog, "sample-catalogue");
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  const ui = await fetch(`${base}/`);
  assert.equal(ui.status, 200);
  assert.match(ui.headers.get("content-security-policy") ?? "", /script-src 'self'/);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  const { base: noUi } = await start({ SERVE_DEMO_UI: "false" });
  assert.equal((await fetch(`${noUi}/`)).status, 404);
});
