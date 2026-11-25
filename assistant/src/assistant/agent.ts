import Anthropic from "@anthropic-ai/sdk";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { errorFields } from "../logger.js";
import type { ModelGateway, TurnParams } from "./gateway.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { TOOL_DEFINITIONS, executeTool, toolStatus, type ProductCard, type ToolContext } from "./tools.js";

/** Events streamed to the client. `text`, `done` and `error` are the PriceWise widget contract; the rest are optional extras. */
export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "status"; tool: string; message: string }
  | { type: "products"; items: ProductCard[] }
  | { type: "done"; stopReason: string; usage: UsageTotals }
  | { type: "error"; code: AssistantErrorCode; message: string };

export type AssistantErrorCode = "overloaded" | "rate_limited" | "timeout" | "upstream" | "bad_request" | "internal";

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  modelCalls: number;
  toolCalls: number;
}

export interface ChatTurnInput {
  /** Validated conversation: starts with a user turn, ends with a user turn. */
  messages: Anthropic.Beta.BetaMessageParam[];
  emit: (event: AssistantEvent) => void;
  signal: AbortSignal;
}

export type AgentSettings = Pick<
  AppConfig,
  "ASSISTANT_MODEL" | "ASSISTANT_EFFORT" | "ASSISTANT_MAX_TOKENS" | "ASSISTANT_ENABLE_FALLBACKS" | "ASSISTANT_MAX_TOOL_ROUNDS"
>;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TRANSPORT_RETRIES = 2;

export const REFUSAL_MESSAGE =
  "Sorry, I can't help with that request. I can help you compare prices, find the best deal, check whether a discount or seller is genuine, and sort out returns.";

/** Maps any failure to a client-safe error event (no internals leaked). */
export function toErrorEvent(err: unknown, signal: AbortSignal): Extract<AssistantEvent, { type: "error" }> {
  if (err instanceof Anthropic.RateLimitError) return { type: "error", code: "rate_limited", message: "The assistant is busy right now. Please try again in a minute." };
  if (err instanceof Anthropic.APIError && (err.status === 529 || (err.status ?? 0) >= 500)) {
    return { type: "error", code: "overloaded", message: "The assistant is temporarily unavailable. Please try again shortly." };
  }
  if (err instanceof Anthropic.BadRequestError) return { type: "error", code: "bad_request", message: "That conversation could not be processed. Please start a new chat." };
  if (err instanceof Anthropic.APIError) return { type: "error", code: "upstream", message: "The assistant ran into a problem. Please try again." };
  if (signal.aborted || (err instanceof Error && err.name === "AbortError")) return { type: "error", code: "timeout", message: "That took too long. Please try a simpler question or try again." };
  return { type: "error", code: "internal", message: "Something went wrong. Please try again." };
}

/**
 * Runs one shopper message to completion: a manual streaming tool-use loop
 * (model -> tools -> model ...), bounded by ASSISTANT_MAX_TOOL_ROUNDS. The
 * last allowed round forbids tools so the shopper always gets an answer.
 * Emits exactly one terminal event (`done` or `error`).
 */
export async function runChatTurn(
  input: ChatTurnInput,
  deps: { gateway: ModelGateway; tools: ToolContext; settings: AgentSettings; logger: Logger },
): Promise<void> {
  const { gateway, tools, settings, logger } = deps;
  const { emit, signal } = input;
  const messages: Anthropic.Beta.BetaMessageParam[] = [...input.messages];
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, modelCalls: 0, toolCalls: 0 };
  let emittedAnyText = false;
  let needsSeparator = false;

  const emitText = (delta: string) => {
    if (!delta) return;
    if (needsSeparator) {
      emit({ type: "text", delta: "\n\n" });
      needsSeparator = false;
    }
    emittedAnyText = true;
    emit({ type: "text", delta });
  };

  try {
    for (let round = 0; round <= settings.ASSISTANT_MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === settings.ASSISTANT_MAX_TOOL_ROUNDS;
      const params: TurnParams = {
        model: settings.ASSISTANT_MODEL,
        max_tokens: settings.ASSISTANT_MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOL_DEFINITIONS,
        // Cache the growing conversation (including tool results) across loop rounds.
        cache_control: { type: "ephemeral" },
        output_config: { effort: settings.ASSISTANT_EFFORT },
        messages,
        ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
        ...(settings.ASSISTANT_ENABLE_FALLBACKS ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      };

      let message: Anthropic.Beta.BetaMessage | undefined;
      for (let attempt = 0; ; attempt++) {
        let textThisAttempt = false;
        try {
          message = await gateway.streamTurn(
            params,
            (d) => {
              textThisAttempt = true;
              emitText(d);
            },
            signal,
          );
          break;
        } catch (err) {
          // API errors were already retried by the SDK; aborts are final. A dropped
          // connection or unparseable streamed tool input is re-issued, but only if
          // nothing reached the shopper yet (otherwise the retry would duplicate text).
          const retryable = !(err instanceof Anthropic.APIError) && !signal.aborted && !textThisAttempt && attempt < MAX_TRANSPORT_RETRIES;
          if (!retryable) throw err;
          logger.warn("model_turn_retry", { round, attempt, ...errorFields(err) });
        }
      }

      usage.modelCalls++;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;

      const stop = message.stop_reason;
      if (stop === "refusal") {
        logger.warn("model_refusal", { round, category: message.stop_details?.category ?? null });
        if (!emittedAnyText) emitText(REFUSAL_MESSAGE);
        emit({ type: "done", stopReason: "refusal", usage });
        return;
      }

      if (stop === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      // Only a clean "tool_use" stop runs tools. A tool call cut off at max_tokens can
      // still parse as a valid-looking partial input, so it is never executed.
      if (stop !== "tool_use" || toolUses.length === 0) {
        if (stop === "max_tokens") logger.warn("model_max_tokens", { round, truncated_tool_call: toolUses.length > 0 });
        if (!emittedAnyText) emitText("Sorry, I couldn't put an answer together. Please try rephrasing your question.");
        emit({ type: "done", stopReason: stop ?? "unknown", usage });
        return;
      }

      // Keep the full assistant content (including fallback / thinking blocks) so the
      // next request replays the conversation exactly.
      messages.push({ role: "assistant", content: message.content });

      for (const name of new Set(toolUses.map((t) => t.name))) emit({ type: "status", tool: name, message: toolStatus(name) });
      usage.toolCalls += toolUses.length;

      // Tools are read-only and independent: run them concurrently and return all
      // results in a single user message.
      const outcomes = await Promise.all(toolUses.map((t) => executeTool(t.name, t.input, tools)));
      if (signal.aborted) throw signal.reason ?? new Error("aborted");

      const cards = outcomes.flatMap((o) => o.cards ?? []);
      if (cards.length) {
        const unique = [...new Map(cards.map((c) => [c.id, c])).values()];
        emit({ type: "products", items: unique.slice(0, 8) });
      }

      messages.push({
        role: "user",
        content: toolUses.map((t, i) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          is_error: outcomes[i]!.isError ?? false,
          content: JSON.stringify(outcomes[i]!.result),
        })),
      });
      if (emittedAnyText) needsSeparator = true;
    }
    // The last round runs with tool_choice "none", so the loop always returns above.
    throw new Error("tool loop exhausted");
  } catch (err) {
    const event = toErrorEvent(err, signal);
    if (signal.aborted) logger.warn("chat_turn_aborted", { code: event.code, ...errorFields(err), usage });
    else logger.error("chat_turn_failed", { code: event.code, ...errorFields(err), usage });
    emit(event);
  } finally {
    logger.info("chat_turn_usage", { ...usage });
  }
}
