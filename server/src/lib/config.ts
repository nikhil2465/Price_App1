import 'dotenv/config';
import { z } from 'zod';

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  /** Number of reverse proxies in front of this server (0 when exposed directly), so req.ip is the real client IP. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  ASSISTANT_URL: z.string().url().default('http://localhost:4100'),
  /** Sent as x-assistant-key so only this server can call the assistant service. */
  ASSISTANT_SHARED_SECRET: optionalSecret.refine((v) => v === undefined || v.length >= 16, 'must be at least 16 characters'),
  OFFER_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(900),
  AMAZON_PAAPI_ACCESS_KEY: optionalSecret,
  AMAZON_PAAPI_SECRET_KEY: optionalSecret,
  AMAZON_PAAPI_PARTNER_TAG: optionalSecret,
  AMAZON_PAAPI_HOST: z.string().default('webservices.amazon.in'),
  AMAZON_PAAPI_REGION: z.string().default('eu-west-1'),
  FLIPKART_AFFILIATE_ID: optionalSecret,
  FLIPKART_AFFILIATE_TOKEN: optionalSecret,
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
