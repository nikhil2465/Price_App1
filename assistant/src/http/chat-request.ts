import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { PRODUCT_ID_PATTERN } from "../data/provider.js";
import { buildContextNote } from "../assistant/prompt.js";

/**
 * Request contract (shared with the PriceWise chat widget):
 *   { messages: [{ role: "user" | "assistant", content: string }], context?: { productId?, compareIds? } }
 *
 * The client owns conversation state, which keeps this service stateless and
 * horizontally scalable. History is untrusted client input: it is bounded,
 * normalised, and only ever carries plain text (never tool blocks).
 */

export const LIMITS = {
  maxMessages: 40,
  /** Only the most recent turns are sent to the model. */
  keepMessages: 24,
  maxUserChars: 2000,
  maxAssistantChars: 12000,
  maxTotalChars: 60000,
  maxBodyBytes: 256 * 1024,
} as const;

const MessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const ChatRequestSchema = z.strictObject({
  messages: z.array(MessageSchema).min(1).max(LIMITS.maxMessages),
  context: z
    .strictObject({
      productId: z.string().regex(PRODUCT_ID_PATTERN).optional(),
      compareIds: z.array(z.string().regex(PRODUCT_ID_PATTERN)).max(4).optional(),
    })
    .optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

/** Strips control characters (except newline/tab) that have no place in chat text. */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function toModelMessages(req: ChatRequest): Anthropic.Beta.BetaMessageParam[] {
  const cleaned = req.messages.map((m) => ({ role: m.role, content: clean(m.content) })).filter((m) => m.content.length > 0);

  const last = cleaned.at(-1);
  if (!last || last.role !== "user") throw new RequestValidationError("The last message must be from the user.");
  if (last.content.length > LIMITS.maxUserChars) {
    throw new RequestValidationError(`Message is too long (max ${LIMITS.maxUserChars} characters).`);
  }

  // Merge consecutive same-role turns, cap each, keep the most recent window,
  // and make sure the conversation starts with a user turn (drops a widget greeting).
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of cleaned) {
    const cap = m.role === "user" ? LIMITS.maxUserChars : LIMITS.maxAssistantChars;
    const content = m.content.length > cap ? `${m.content.slice(0, cap)} [truncated]` : m.content;
    const prev = merged.at(-1);
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${content}`;
    else merged.push({ role: m.role, content });
  }
  let window = merged.slice(-LIMITS.keepMessages);
  while (window.length && window[0]!.role !== "user") window = window.slice(1);

  let total = window.reduce((n, m) => n + m.content.length, 0);
  while (total > LIMITS.maxTotalChars && window.length > 1) {
    const dropped = window.splice(0, 2); // drop the oldest user/assistant pair
    total -= dropped.reduce((n, m) => n + m.content.length, 0);
    while (window.length && window[0]!.role !== "user") window = window.slice(1);
  }
  if (window.length === 0) throw new RequestValidationError("No user message to answer.");

  const note = buildContextNote(req.context);
  return window.map((m, i) => {
    if (i === window.length - 1 && note) {
      return { role: "user", content: [{ type: "text", text: note }, { type: "text", text: m.content }] };
    }
    return { role: m.role, content: m.content };
  });
}
