import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { REFUSAL_MESSAGE, runChatTurn, type AgentSettings, type AssistantEvent } from "../src/assistant/agent.js";
import { SYSTEM_PROMPT } from "../src/assistant/prompt.js";
import { ScriptedGateway, msg, sampleCatalog, silentLogger, text, toolUse, type Step } from "./helpers.js";

const settings: AgentSettings = {
  ASSISTANT_MODEL: "claude-opus-5-5",
  ASSISTANT_EFFORT: "medium",
  ASSISTANT_MAX_TOKENS: 16000,
  ASSISTANT_ENABLE_FALLBACKS: true,
  ASSISTANT_MAX_TOOL_ROUNDS: 3,
};

async function run(steps: Step[], opts: { signal?: AbortSignal; settings?: Partial<AgentSettings> } = {}) {
  const gateway = new ScriptedGateway(steps);
  const events: AssistantEvent[] = [];
  await runChatTurn(
    { messages: [{ role: "user", content: "best phone under 25000?" }], emit: (e) => events.push(e), signal: opts.signal ?? new AbortController().signal },
    { gateway, tools: { catalog: sampleCatalog(), logger: silentLogger }, settings: { ...settings, ...opts.settings }, logger: silentLogger },
  );
  const textOut = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
  return { gateway, events, textOut, terminal: events.at(-1)! };
}

test("tool round trip: runs the tool, feeds the result back, streams the answer, ends with done", async () => {
  const { gateway, events, textOut, terminal } = await run([
    msg([text("Let me check."), toolUse("tu_1", "search_products", { query: "phone", max_price: 25000 })], "tool_use"),
    msg([text("The OnePlus Nord CE4 is my pick.")], "end_turn"),
  ]);
  assert.equal(terminal.type, "done");
  assert.equal(textOut, "Let me check.\n\nThe OnePlus Nord CE4 is my pick.");
  assert.ok(events.some((e) => e.type === "status" && e.tool === "search_products"));
  assert.ok(events.some((e) => e.type === "products" && e.items.length > 0));

  assert.equal(gateway.calls.length, 2);
  const first = gateway.calls[0]!;
  assert.equal(first.model, "claude-opus-5-5");
  assert.deepEqual(first.output_config, { effort: "medium" });
  assert.equal(first.thinking, undefined, "Opus 5.5 runs adaptive thinking by default");
  assert.deepEqual(first.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(first.fallbacks, "default");
  assert.equal((first.system as { text: string }[])[0]!.text, SYSTEM_PROMPT);
  assert.equal(first.tool_choice, undefined);

  const second = gateway.calls[1]!;
  const toolResultTurn = second.messages.at(-1)!;
  assert.equal(toolResultTurn.role, "user");
  const block = (toolResultTurn.content as { type: string; tool_use_id: string; is_error: boolean; content: string }[])[0]!;
  assert.equal(block.type, "tool_result");
  assert.equal(block.tool_use_id, "tu_1");
  assert.equal(block.is_error, false);
  assert.ok(JSON.parse(block.content).results.length > 0);
  assert.equal(second.messages.at(-2)!.role, "assistant", "full assistant content replayed");
});

test("parallel tool calls return all results in one user message", async () => {
  const { gateway } = await run([
    msg([toolUse("a", "get_product_details", { product_id: "iphone-16-128gb" }), toolUse("b", "check_discount", { product_id: "iphone-16-128gb" })], "tool_use"),
    msg([text("Done.")], "end_turn"),
  ]);
  const results = gateway.calls[1]!.messages.at(-1)!.content as { tool_use_id: string }[];
  assert.deepEqual(results.map((r) => r.tool_use_id), ["a", "b"]);
});

test("invalid tool input goes back as is_error so the model can correct itself", async () => {
  const { gateway } = await run([
    msg([toolUse("x", "get_product_details", { productId: "iphone-16-128gb" })], "tool_use"),
    msg([text("ok")], "end_turn"),
  ]);
  const r = (gateway.calls[1]!.messages.at(-1)!.content as { is_error: boolean }[])[0]!;
  assert.equal(r.is_error, true);
});

test("last allowed round forbids tools so the shopper always gets an answer", async () => {
  const loop = () => msg([toolUse(`t${Math.random()}`, "list_marketplaces", {})], "tool_use");
  const { gateway, terminal, textOut } = await run([loop(), loop(), loop(), msg([text("Here is what I found.")], "end_turn")]);
  assert.equal(gateway.calls.length, 4);
  assert.deepEqual(gateway.calls[3]!.tool_choice, { type: "none" });
  assert.equal(terminal.type, "done");
  assert.equal(textOut, "Here is what I found.");
});

test("refusal ends the turn with a polite message and never runs that turn's tools", async () => {
  const { gateway, textOut, terminal } = await run([msg([toolUse("r", "search_products", { query: "x" })], "refusal")]);
  assert.equal(gateway.calls.length, 1);
  assert.equal(textOut, REFUSAL_MESSAGE);
  assert.equal(terminal.type, "done");
});

test("tool call cut off at max_tokens is not executed", async () => {
  const { gateway, terminal } = await run([msg([toolUse("m", "search_products", { query: "pho" })], "max_tokens")]);
  assert.equal(gateway.calls.length, 1);
  assert.equal(terminal.type, "done");
});

test("transport failure before any text is retried; API errors are not", async () => {
  const ok = await run([new Error("socket hang up"), msg([text("hi")], "end_turn")]);
  assert.equal(ok.gateway.calls.length, 2);
  assert.equal(ok.terminal.type, "done");

  const apiErr = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers());
  const failed = await run([apiErr]);
  assert.equal(failed.gateway.calls.length, 1);
  assert.deepEqual(failed.terminal, { type: "error", code: "rate_limited", message: "The assistant is busy right now. Please try again in a minute." });
});

test("aborted request (client went away) stops cleanly with one terminal event", async () => {
  const ac = new AbortController();
  ac.abort(new Error("client disconnected"));
  const { events, terminal } = await run([msg([text("never")], "end_turn")], { signal: ac.signal });
  assert.equal(terminal.type, "error");
  assert.equal(events.filter((e) => e.type === "done" || e.type === "error").length, 1);
});

test("fallbacks can be disabled for platforms without server-side fallback", async () => {
  const { gateway } = await run([msg([text("hi")], "end_turn")], { settings: { ASSISTANT_ENABLE_FALLBACKS: false } });
  assert.equal(gateway.calls[0]!.betas, undefined);
  assert.equal(gateway.calls[0]!.fallbacks, undefined);
});
