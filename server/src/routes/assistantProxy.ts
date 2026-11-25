import { Readable } from 'node:stream';
import { Router } from 'express';
import { logger } from '../lib/logger.js';

const FORWARD_REQUEST_HEADERS = ['content-type', 'accept', 'x-request-id'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control', 'x-request-id'];
const TIMEOUT_MS = 120_000;

/**
 * Streams /api/assistant/* to the AI assistant service so the browser only ever talks to one origin.
 * The body is already size-limited by express.json() upstream of this router.
 */
export function assistantProxy(assistantUrl: string, sharedSecret?: string): Router {
  const base = new URL(assistantUrl);
  const r = Router();

  r.all('/*', async (req, res) => {
    const target = new URL(`/api/assistant${req.path}`, base);
    const controller = new AbortController();
    // Covers the whole exchange, including the streamed body; cleared when the response finishes or the client leaves.
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    res.on('close', () => {
      clearTimeout(timer);
      controller.abort();
    });

    const headers: Record<string, string> = {};
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = req.headers[h];
      if (typeof v === 'string') headers[h] = v;
    }
    // The assistant rate-limits per shopper, so pass the client IP (resolved via `trust proxy`), not ours.
    if (req.ip) headers['x-forwarded-for'] = req.ip;
    if (sharedSecret) headers['x-assistant-key'] = sharedSecret;
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
        signal: controller.signal,
      });
      res.status(upstream.status);
      for (const h of FORWARD_RESPONSE_HEADERS) {
        const v = upstream.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      res.setHeader('X-Accel-Buffering', 'no');
      if (!upstream.body) {
        clearTimeout(timer);
        res.end();
        return;
      }
      res.flushHeaders();
      Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>)
        .on('error', (err) => {
          if (!controller.signal.aborted) logger.warn({ err: err.message }, 'assistant stream error');
          res.end();
        })
        .pipe(res);
    } catch (err) {
      clearTimeout(timer);
      if (res.headersSent) {
        res.end();
        return;
      }
      logger.warn({ err: (err as Error).message, target: target.origin }, 'assistant service unreachable');
      res.status(503).json({
        error: { code: 'assistant_unavailable', message: 'The shopping assistant is offline right now. Please try again shortly.' },
      });
    }
  });

  return r;
}
