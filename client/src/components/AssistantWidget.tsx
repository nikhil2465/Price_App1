import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { streamAssistant, type AssistantContext, type ChatMessage } from '../lib/assistant';

const SUGGESTIONS = [
  'Best phone under ₹30,000 with a good camera?',
  'Should I buy now or wait for a sale?',
  'Which bank card gives the biggest discount here?',
  'Compare these on battery life and value',
];

/** Renders the small Markdown subset the assistant uses (bold, bullets, numbered lists) as React nodes, never as HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={`my-1 space-y-0.5 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '');
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet?.[1] !== undefined || numbered?.[1] !== undefined) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet?.[1] ?? numbered?.[1])!);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length} className="my-1">{inline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

function useAssistantContext(): AssistantContext {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const m = pathname.match(/^\/product\/([a-z0-9-]+)$/);
    if (m?.[1]) return { productId: m[1] };
    if (pathname === '/compare') {
      const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
      return ids.length ? { compareIds: ids } : {};
    }
    return {};
  }, [pathname, params]);
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const context = useAssistantContext();

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim().slice(0, 2000);
    if (!content || busy) return;
    setError(null);
    setInput('');
    const history: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAssistant(
        history,
        context,
        (delta) =>
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta };
            return next;
          }),
        ctrl.signal,
        setStatus,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
        // drop the empty assistant bubble
        setMessages((prev) => (prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev));
      }
    } finally {
      setStatus(null);
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? 'Close shopping assistant' : 'Open shopping assistant'}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-800 text-white shadow-lift transition hover:scale-105"
      >
        {open ? <X size={24} /> : <Sparkles size={24} />}
      </button>

      {open && (
        <section
          id="assistant-panel"
          aria-label="Shopping assistant"
          className="fixed inset-x-3 bottom-24 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lift sm:inset-x-auto sm:right-5 sm:w-[400px]"
        >
          <header className="flex items-center gap-3 bg-gradient-to-r from-brand-800 to-brand-600 px-5 py-4 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Bot size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">PriceWise Assistant</p>
              <p className="text-xs text-white/80">
                {context.productId ? 'Knows the product you are viewing' : context.compareIds ? 'Knows the products you are comparing' : 'Ask anything about buying smart'}
              </p>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div>
                <p className="text-sm text-ink-700">Hi! I compare prices, offers and specs across stores and tell you when to buy. Try:</p>
                <div className="mt-3 flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void send(s)} className="rounded-xl border border-ink-100 px-3 py-2 text-left text-sm hover:border-brand-500 hover:bg-brand-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user' ? 'rounded-br-md bg-brand-700 text-white' : 'rounded-bl-md bg-ink-100 text-ink-900'
                  }`}
                >
                  {m.content ? (
                    m.role === 'assistant' ? <MarkdownLite text={m.content} /> : <span className="whitespace-pre-wrap">{m.content}</span>
                  ) : busy && i === messages.length - 1 ? (
                    <span className="inline-flex items-center gap-2 text-ink-500">
                      <Loader2 className="animate-spin" size={16} aria-hidden="true" /> {status ?? 'Thinking…'}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-ink-100 p-3">
            <label htmlFor="assistant-input" className="sr-only">
              Message
            </label>
            <input
              id="assistant-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder="Ask about prices, offers, specs…"
              className="min-w-0 flex-1 rounded-xl bg-ink-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl bg-ink-100 px-3 py-2.5 text-sm font-medium">
                Stop
              </button>
            ) : (
              <button type="submit" aria-label="Send" disabled={!input.trim()} className="rounded-xl bg-brand-700 p-2.5 text-white disabled:opacity-40">
                <Send size={18} />
              </button>
            )}
          </form>
        </section>
      )}
    </>
  );
}
