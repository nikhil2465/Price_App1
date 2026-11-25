export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantContext {
  productId?: string;
  compareIds?: string[];
}

type StreamEvent = { type: 'text'; delta: string } | { type: 'done' } | { type: 'error'; message: string };

/**
 * Streams a reply from POST /api/assistant/chat (server-sent events).
 * Calls onDelta for each text chunk; resolves when the stream ends; rejects with a user-facing message on failure.
 */
export async function streamAssistant(
  messages: ChatMessage[],
  context: AssistantContext,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: messages.slice(-20), context }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error('Could not reach the assistant. Check your connection.');
  }
  if (!res.ok || !res.body) {
    let msg = res.status === 429 ? 'You are sending messages quickly. Please wait a moment.' : 'The assistant is unavailable right now.';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) msg = body.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
      const data = rawEvent
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      let evt: StreamEvent;
      try {
        evt = JSON.parse(data) as StreamEvent;
      } catch {
        continue;
      }
      if (evt.type === 'text') onDelta(evt.delta);
      else if (evt.type === 'error') throw new Error(evt.message || 'The assistant hit a problem.');
      else if (evt.type === 'done') return;
    }
  }
}
