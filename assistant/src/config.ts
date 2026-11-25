import { z } from "zod";

/**
 * All runtime configuration comes from environment variables, validated once at
 * startup so a misconfigured deployment fails fast instead of at first request.
 * Secrets (ANTHROPIC_API_KEY, ASSISTANT_SHARED_SECRET) are read by their consumers
 * and never logged.
 */

const boolFromEnv = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),

  /** Claude model. Defaults to Claude Opus 5.5. */
  ASSISTANT_MODEL: z.string().min(1).default("claude-opus-5-5"),
  /** Reasoning effort for chat turns. */
  ASSISTANT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  ASSISTANT_MAX_TOKENS: z.coerce.number().int().min(1024).max(128000).default(16000),
  /** Server-side refusal fallback ("default" routing). Disable on platforms without it. */
  ASSISTANT_ENABLE_FALLBACKS: boolFromEnv.default(true),
  /** Hard cap on model <-> tool round trips per user message. */
  ASSISTANT_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(20).default(8),
  /** Wall-clock budget for one chat request, in ms. */
  ASSISTANT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(120000),

  /**
   * Base URL of the PriceWise API (e.g. http://localhost:4000). When unset the
   * assistant runs on its bundled sample catalogue, clearly labelled as sample data.
   */
  PRICEWISE_API_URL: z.string().url().optional(),
  PRICEWISE_API_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),

  /** When set, POST /api/assistant/chat requires header `x-assistant-key` with this value. */
  ASSISTANT_SHARED_SECRET: z.string().min(16).optional(),
  /** Comma-separated list of allowed browser origins for CORS. Empty = same-origin only. */
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  /** Trust X-Forwarded-For (only when running behind your own proxy). */
  TRUST_PROXY: boolFromEnv.default(false),
  /** Per-client requests per minute on the chat endpoint. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10000).default(20),
  /** Concurrent streaming chats per instance; excess gets HTTP 503. */
  MAX_CONCURRENT_CHATS: z.coerce.number().int().min(1).max(10000).default(64),
  /** Serve the standalone demo chat UI at `/`. */
  SERVE_DEMO_UI: boolFromEnv.default(true),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof ConfigSchema> & { corsAllowedOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Treat empty strings as unset so `FOO=` in a .env file behaves like no value.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = ConfigSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const corsAllowedOrigins = parsed.data.CORS_ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...parsed.data, corsAllowedOrigins };
}
