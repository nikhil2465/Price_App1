import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { logger } from './lib/logger.js';

const config = loadConfig();

// In production the built client (client/dist) is served by this process.
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.resolve(here, '../../../../client/dist'), path.resolve(here, '../../client/dist')];
const staticDir = config.NODE_ENV === 'production' ? candidates.find((p) => existsSync(path.join(p, 'index.html'))) : undefined;

const app = createApp(config, { staticDir });
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, staticDir: staticDir ?? null }, 'PriceWise API listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
