import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { CATALOG } from './data/catalog.js';
import type { Config } from './lib/config.js';
import { errorHandler, notFound } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { AmazonPaapiProvider } from './providers/amazon.js';
import { FlipkartAffiliateProvider } from './providers/flipkart.js';
import { SampleCatalogSource } from './providers/sample.js';
import { apiRouter } from './routes/api.js';
import { assistantProxy } from './routes/assistantProxy.js';
import { OfferService } from './services/offerService.js';
import { SearchService } from './services/searchService.js';

export function createApp(config: Config, opts: { now?: () => Date; staticDir?: string } = {}) {
  const offers = new OfferService({
    sample: new SampleCatalogSource(),
    live: [
      new AmazonPaapiProvider({
        accessKey: config.AMAZON_PAAPI_ACCESS_KEY,
        secretKey: config.AMAZON_PAAPI_SECRET_KEY,
        partnerTag: config.AMAZON_PAAPI_PARTNER_TAG,
        host: config.AMAZON_PAAPI_HOST,
        region: config.AMAZON_PAAPI_REGION,
      }),
      new FlipkartAffiliateProvider({ affiliateId: config.FLIPKART_AFFILIATE_ID, token: config.FLIPKART_AFFILIATE_TOKEN }),
    ],
    cacheTtlMs: config.OFFER_CACHE_TTL_SECONDS * 1000,
    now: opts.now,
  });
  const search = new SearchService(offers);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.CORS_ORIGINS.includes(origin)),
      methods: ['GET', 'POST'],
    }),
  );
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Compression would buffer server-sent events, so it is skipped for the assistant stream.
  app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/assistant') && compression.filter(req, res) }));

  app.use(
    '/api/assistant',
    rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }),
    express.json({ limit: '64kb' }),
    assistantProxy(config.ASSISTANT_URL),
  );
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api', apiRouter({ offers, search }));
  app.use('/api', notFound);

  if (opts.staticDir) {
    const dir = opts.staticDir;
    app.use(express.static(dir, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: dir }));
  }

  app.use(errorHandler);

  logger.info(
    {
      products: CATALOG.length,
      live: { amazon: offers.isLiveEnabled('amazon'), flipkart: offers.isLiveEnabled('flipkart') },
    },
    'PriceWise API configured',
  );
  return app;
}
