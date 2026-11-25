import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/lib/config.js';

const app = createApp(loadConfig({ NODE_ENV: 'test', ASSISTANT_URL: 'http://127.0.0.1:9' }), {
  now: () => new Date('2026-11-25T06:00:00Z'),
});

describe('API', () => {
  it('lists marketplaces with live flags off by default', async () => {
    const r = await request(app).get('/api/marketplaces').expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(9);
    expect(r.body.every((m: { liveEnabled: boolean }) => m.liveEnabled === false)).toBe(true);
  });

  it('searches, tags sample data and returns facets', async () => {
    const r = await request(app).get('/api/search').query({ q: 'headphones' }).expect(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.results[0].dataSource).toBe('sample');
    expect(r.body.facets.brands.length).toBeGreaterThan(0);
    expect(r.body.results[0].product.basePrice).toBeUndefined();
  });

  it('filters by marketplace, brand and price and sorts by price', async () => {
    const r = await request(app)
      .get('/api/search')
      .query({ category: 'smartphones', marketplaces: 'amazon,flipkart', sort: 'price-asc' })
      .expect(200);
    const prices = r.body.results.map((x: { bestPrice: number }) => x.bestPrice);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(r.body.results.every((x: { bestMarketplaceId: string }) => ['amazon', 'flipkart'].includes(x.bestMarketplaceId))).toBe(true);

    const b = await request(app).get('/api/search').query({ category: 'smartphones', brand: 'Apple' }).expect(200);
    expect(b.body.results.every((x: { product: { brand: string } }) => x.product.brand === 'Apple')).toBe(true);
  });

  it('is deterministic for the same clock', async () => {
    const a = await request(app).get('/api/products/sony-wh-1000xm5');
    const b = await request(app).get('/api/products/sony-wh-1000xm5');
    expect(a.body).toEqual(b.body);
  });

  it('returns product detail with ranked offers and an insight', async () => {
    const r = await request(app).get('/api/products/apple-iphone-16-128gb').expect(200);
    expect(r.body.offers.length).toBeGreaterThan(1);
    expect(r.body.offers.filter((o: { isBestPrice: boolean }) => o.isBestPrice)).toHaveLength(1);
    expect(['great', 'fair', 'high']).toContain(r.body.insight.verdict);
  });

  it('returns 90 days of history per store, ending today at the current price', async () => {
    const r = await request(app).get('/api/products/apple-iphone-16-128gb/history').expect(200);
    const amazon = r.body.filter((p: { marketplaceId: string }) => p.marketplaceId === 'amazon');
    expect(amazon).toHaveLength(90);
    expect(amazon.at(-1).date).toBe('2026-11-25');
    const detail = await request(app).get('/api/products/apple-iphone-16-128gb');
    const amazonOffer = detail.body.offers.find((o: { marketplaceId: string }) => o.marketplaceId === 'amazon');
    expect(amazon.at(-1).price).toBe(amazonOffer.price);
  });

  it('compares up to four products', async () => {
    const r = await request(app).get('/api/compare').query({ ids: 'apple-iphone-16-128gb,oneplus-13-256gb' }).expect(200);
    expect(r.body).toHaveLength(2);
    await request(app).get('/api/compare').query({ ids: 'a,b,c,d,e' }).expect(400);
  });

  it('validates input', async () => {
    await request(app).get('/api/products/..%2Fetc').expect(400);
    await request(app).get('/api/products/does-not-exist').expect(404);
    await request(app).get('/api/search').query({ marketplaces: 'ebay' }).expect(400);
    await request(app).get('/api/search').query({ minPrice: 10, maxPrice: 1 }).expect(400);
    await request(app).get('/api/search').query({ q: 'x'.repeat(500) }).expect(400);
    await request(app).get('/api/nope').expect(404);
  });

  it('reports the assistant as unavailable when its service is down', async () => {
    const r = await request(app).post('/api/assistant/chat').send({ messages: [] }).expect(503);
    expect(r.body.error.code).toBe('assistant_unavailable');
  });
});
