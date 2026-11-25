import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatRequestSchema, LIMITS, RequestValidationError, toModelMessages } from "../src/http/chat-request.js";

const parse = (body: unknown) => ChatRequestSchema.parse(body);

test("drops a leading assistant greeting and merges consecutive same-role turns", () => {
  const out = toModelMessages(
    parse({ messages: [
      { role: "assistant", content: "Hi! How can I help?" },
      { role: "user", content: "phone" },
      { role: "user", content: "under 25k" },
    ] }),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.role, "user");
  assert.equal(out[0]!.content, "phone\n\nunder 25k");
});

test("rejects a conversation that does not end with the user", () => {
  assert.throws(() => toModelMessages(parse({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] })), RequestValidationError);
});

test("rejects an over-long user message and strips control characters", () => {
  assert.throws(() => toModelMessages(parse({ messages: [{ role: "user", content: "x".repeat(LIMITS.maxUserChars + 1) }] })), RequestValidationError);
  const out = toModelMessages(parse({ messages: [{ role: "user", content: "hi\u0000\u0007 there" }] }));
  assert.equal(out[0]!.content, "hi there");
});

test("app context is attached to the latest user turn only", () => {
  const out = toModelMessages(
    parse({
      messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "is this a good deal?" }],
      context: { productId: "iphone-16-128gb" },
    }),
  );
  assert.equal(typeof out[0]!.content, "string");
  const last = out.at(-1)!;
  assert.ok(Array.isArray(last.content));
  const blocks = last.content as { type: string; text: string }[];
  assert.match(blocks[0]!.text, /iphone-16-128gb/);
  assert.equal(blocks[1]!.text, "is this a good deal?");
});

test("schema rejects bad context ids, unknown fields and roles", () => {
  assert.equal(ChatRequestSchema.safeParse({ messages: [{ role: "user", content: "a" }], context: { productId: "<script>" } }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ messages: [{ role: "system", content: "a" }] }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ messages: [{ role: "user", content: "a" }], tools: [] }).success, false);
  assert.equal(ChatRequestSchema.safeParse({ messages: [] }).success, false);
});

test("keeps only the most recent window and always starts with a user turn", () => {
  const messages = Array.from({ length: 39 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` }));
  const out = toModelMessages(parse({ messages }));
  assert.ok(out.length <= LIMITS.keepMessages);
  assert.equal(out[0]!.role, "user");
  assert.equal(out.at(-1)!.content, "m38");
});
