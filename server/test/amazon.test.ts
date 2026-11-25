import { describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../src/data/catalog.js';
import { AmazonPaapiProvider, deriveSigningKey, signPaapiRequest } from '../src/providers/amazon.js';

describe('SigV4', () => {
  it('derives the signing key from the AWS documentation test vector', () => {
    const key = deriveSigningKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', 'us-east-1', 'iam');
    expect(key.toString('hex')).toBe('f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
  });
  it('produces a well-formed authorization header', () => {
    const h = signPaapiRequest({
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'secret',
      host: 'webservices.amazon.in',
      region: 'eu-west-1',
      body: '{}',
      now: new Date('2026-01-02T03:04:05.678Z'),
    });
    expect(h['x-amz-date']).toBe('20260102T030405Z');
    expect(h.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260102\/eu-west-1\/ProductAdvertisingAPI\/aws4_request, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/,
    );
  });
});

describe('AmazonPaapiProvider', () => {
  const product = { ...CATALOG[0]!, externalIds: { amazon: 'B0DGHYDZR9' } };
  const cfg = { accessKey: 'a', secretKey: 'b', partnerTag: 'tag-21', host: 'webservices.amazon.in', region: 'eu-west-1' };

  it('is disabled without credentials and returns null', async () => {
    const p = new AmazonPaapiProvider({ host: 'h', region: 'r' });
    expect(p.enabled).toBe(false);
    expect(await p.fetchOffer(product, new AbortController().signal)).toBeNull();
  });

  it('maps a GetItems listing into a live offer', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ItemsResult: {
            Items: [
              {
                ASIN: 'B0DGHYDZR9',
                DetailPageURL: 'https://www.amazon.in/dp/B0DGHYDZR9?tag=tag-21',
                Offers: { Listings: [{ Price: { Amount: 65999 }, SavingBasis: { Amount: 79900 }, Availability: { Type: 'Now' }, MerchantInfo: { Name: 'Appario' } }] },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const p = new AmazonPaapiProvider(cfg, fetchImpl as unknown as typeof fetch);
    const offer = await p.fetchOffer(product, new AbortController().signal);
    expect(offer).toMatchObject({ price: 65999, mrp: 79900, inStock: true, dataSource: 'live', sellerName: 'Appario' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws on HTTP errors so the caller can fall back', async () => {
    const p = new AmazonPaapiProvider(cfg, (async () => new Response('nope', { status: 429 })) as unknown as typeof fetch);
    await expect(p.fetchOffer(product, new AbortController().signal)).rejects.toThrow('429');
  });
});
