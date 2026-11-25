import { loadConfig } from "./config.js";
import { createLogger, errorFields } from "./logger.js";
import { AnthropicGateway } from "./assistant/gateway.js";
import { HttpCatalogProvider } from "./data/http-provider.js";
import { SampleCatalogProvider } from "./data/sample-provider.js";
import type { CatalogProvider } from "./data/provider.js";
import { createServer } from "./http/server.js";
import { TokenBucketLimiter } from "./http/rate-limit.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, { service: "pricewise-assistant" });

const catalog: CatalogProvider = config.PRICEWISE_API_URL
  ? new HttpCatalogProvider({ baseUrl: config.PRICEWISE_API_URL, timeoutMs: config.PRICEWISE_API_TIMEOUT_MS, logger })
  : new SampleCatalogProvider();

if (!config.PRICEWISE_API_URL) {
  logger.warn("using_sample_catalogue", { hint: "Set PRICEWISE_API_URL to use the PriceWise API." });
}
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
  // Not fatal: the SDK can also use a profile saved by `ant auth login` or workload identity.
  logger.warn("no_anthropic_credentials_in_env", { hint: "Set ANTHROPIC_API_KEY (or sign in with `ant auth login`); chat requests fail until credentials resolve." });
}
if (config.NODE_ENV === "production" && !config.ASSISTANT_SHARED_SECRET) {
  logger.warn("no_shared_secret", { hint: "Set ASSISTANT_SHARED_SECRET so only the PriceWise server can call this service." });
}

const server = createServer({
  config,
  logger,
  gateway: new AnthropicGateway(),
  catalog,
  limiter: new TokenBucketLimiter(config.RATE_LIMIT_PER_MINUTE),
});

// Streaming responses can run for minutes; keep Node's request timeout above our own budget.
server.requestTimeout = config.ASSISTANT_REQUEST_TIMEOUT_MS + 10_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

server.listen(config.PORT, config.HOST, () => {
  logger.info("listening", { host: config.HOST, port: config.PORT, catalog: catalog.name, model: config.ASSISTANT_MODEL });
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutting_down", { signal });
  // Stop accepting new connections; let in-flight streams finish up to the request budget.
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), config.ASSISTANT_REQUEST_TIMEOUT_MS).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => logger.error("unhandled_rejection", errorFields(err)));
