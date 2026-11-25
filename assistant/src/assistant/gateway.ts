import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export type TurnParams = BetaMessageStreamParams;

/**
 * The one seam between the agent loop and the Claude API. Production uses
 * `AnthropicGateway`; tests inject a scripted gateway, so the loop is tested
 * without network calls or API spend.
 */
export interface ModelGateway {
  /**
   * Streams one model turn. Calls `onText` for each text delta and resolves
   * with the complete message. Rejects with Anthropic.APIError for API errors
   * and with other errors for transport/parse failures.
   */
  streamTurn(params: TurnParams, onText: (delta: string) => void, signal: AbortSignal): Promise<Anthropic.Beta.BetaMessage>;
}

export class AnthropicGateway implements ModelGateway {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    // Credentials resolve from the environment (ANTHROPIC_API_KEY etc.); never hardcoded.
    // maxRetries covers 408/409/429/5xx and connection errors before the stream starts.
    this.client = client ?? new Anthropic({ maxRetries: 2 });
  }

  async streamTurn(params: TurnParams, onText: (delta: string) => void, signal: AbortSignal): Promise<Anthropic.Beta.BetaMessage> {
    const stream = this.client.beta.messages.stream(params, { signal });
    stream.on("text", (delta) => onText(delta));
    return stream.finalMessage();
  }
}
