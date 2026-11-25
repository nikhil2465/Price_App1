import type Anthropic from "@anthropic-ai/sdk";
import type { ModelGateway, TurnParams } from "../src/assistant/gateway.js";
import { createLogger } from "../src/logger.js";
import { SampleCatalogProvider } from "../src/data/sample-provider.js";

export const FIXED_NOW = new Date("2026-11-25T06:00:00.000Z");
export const silentLogger = createLogger("error");
export const sampleCatalog = () => new SampleCatalogProvider({ now: () => FIXED_NOW });

type Block = Anthropic.Beta.BetaContentBlock;

export function msg(content: Block[], stop_reason: Anthropic.Beta.BetaStopReason, extra: Partial<Anthropic.Beta.BetaMessage> = {}): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
    ...extra,
  } as unknown as Anthropic.Beta.BetaMessage;
}

export const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as unknown as Block;
export const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input }) as unknown as Block;

export type Step = Anthropic.Beta.BetaMessage | Error | ((params: TurnParams) => Anthropic.Beta.BetaMessage);

/** Replays scripted model turns, streaming each turn's text blocks as deltas, and records requests. */
export class ScriptedGateway implements ModelGateway {
  readonly calls: TurnParams[] = [];
  constructor(private readonly steps: Step[]) {}

  async streamTurn(params: TurnParams, onText: (d: string) => void, signal: AbortSignal): Promise<Anthropic.Beta.BetaMessage> {
    // Snapshot: the agent mutates its messages array after the call returns.
    this.calls.push(structuredClone(params));
    if (signal.aborted) throw signal.reason;
    const step = this.steps.shift();
    if (!step) throw new Error("ScriptedGateway: no more steps");
    if (step instanceof Error) throw step;
    const m = typeof step === "function" ? step(params) : step;
    for (const b of m.content) if (b.type === "text") onText(b.text);
    return m;
  }
}
