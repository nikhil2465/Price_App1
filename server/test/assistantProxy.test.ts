import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/lib/config.js';

let upstream: http.Server;
let seen: http.IncomingHttpHeaders = {};
let url = '';

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen = req.headers;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"type":"text","delta":"hi"}\n\n');
    res.end('data: {"type":"done"}\n\n');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => upstream.close(() => r())));

describe('assistant proxy', () => {
  it('streams the reply and forwards client IP and the shared secret', async () => {
    const app = createApp(loadConfig({ NODE_ENV: 'test', ASSISTANT_URL: url, ASSISTANT_SHARED_SECRET: 'test-secret-0123456789' }));
    const r = await request(app).post('/api/assistant/chat').set('X-Forwarded-For', '203.0.113.7').send({ messages: [{ role: 'user', content: 'hi' }] }).expect(200);
    expect(r.headers['content-type']).toContain('text/event-stream');
    expect(r.text).toContain('"type":"done"');
    expect(seen['x-assistant-key']).toBe('test-secret-0123456789');
    expect(seen['x-forwarded-for']).toBe('203.0.113.7');
  });

  it('sends no key header when no secret is configured', async () => {
    const app = createApp(loadConfig({ NODE_ENV: 'test', ASSISTANT_URL: url }));
    await request(app).post('/api/assistant/chat').send({ messages: [] }).expect(200);
    expect(seen['x-assistant-key']).toBeUndefined();
  });
});
