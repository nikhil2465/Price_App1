import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { errorFields } from "../logger.js";
import { runChatTurn, type AgentSettings, type AssistantEvent } from "../assistant/agent.js";
import type { ModelGateway } from "../assistant/gateway.js";
import type { CatalogProvider } from "../data/provider.js";
import { ChatRequestSchema, LIMITS, RequestValidationError, toModelMessages } from "./chat-request.js";
import type { RateLimiter } from "./rate-limit.js";

export interface ServerDeps {
  config: AppConfig;
  logger: Logger;
  gateway: ModelGateway;
  catalog: CatalogProvider;
  limiter: RateLimiter;
}

const CHAT_PATH = "/api/assistant/chat";
const HEARTBEAT_MS = 15_000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Works from src/http (tsx) and dist/src/http (compiled).
const PUBLIC_DIR = [path.resolve(HERE, "../../public"), path.resolve(HERE, "../../../public")].find((d) => existsSync(path.join(d, "index.html"))) ?? path.resolve(HERE, "../../public");
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};
const UI_CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

function baseHeaders(res: http.ServerResponse) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("cross-origin-resource-policy", "same-site");
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, err: HttpError) {
  sendJson(res, err.status, { error: { code: err.code, message: err.message } }, err.headers);
}

function clientKey(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and timing does not reveal length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Applies CORS. Returns false (and responds) when the origin is not allowed. */
function applyCors(req: http.IncomingMessage, res: http.ServerResponse, allowed: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigation or server-to-server (the app's proxy)
  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === req.headers.host;
  } catch {
    sameOrigin = false;
  }
  if (sameOrigin) return true;
  if (!allowed.includes(origin)) {
    sendError(res, new HttpError(403, "origin_not_allowed", "Origin not allowed."));
    return false;
  }
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, x-assistant-key, x-request-id");
  res.setHeader("access-control-max-age", "600");
  return true;
}

async function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  const declared = Number(req.headers["content-length"] ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "payload_too_large", "Request body too large.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, "payload_too_large", "Request body too large.");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createServer(deps: ServerDeps): http.Server {
  const { config, logger, gateway, catalog, limiter } = deps;
  const settings: AgentSettings = config;
  let activeChats = 0;

  async function handleChat(req: http.IncomingMessage, res: http.ServerResponse, requestId: string) {
    if (config.ASSISTANT_SHARED_SECRET) {
      const provided = req.headers["x-assistant-key"];
      if (typeof provided !== "string" || !safeEqual(provided, config.ASSISTANT_SHARED_SECRET)) {
        throw new HttpError(401, "unauthorized", "Missing or invalid assistant key.");
      }
    }
    const ctype = req.headers["content-type"] ?? "";
    if (!ctype.toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json.");
    }
    const key = clientKey(req, config.TRUST_PROXY);
    const wait = limiter.take(key);
    if (wait > 0) {
      throw new HttpError(429, "rate_limited", "Too many messages. Please wait a moment.", { "retry-after": String(wait) });
    }
    if (activeChats >= config.MAX_CONCURRENT_CHATS) {
      throw new HttpError(503, "busy", "The assistant is busy. Please try again shortly.", { "retry-after": "5" });
    }

    const raw = await readBody(req, LIMITS.maxBodyBytes);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
    }
    const parsed = ChatRequestSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, "invalid_request", `Invalid request: ${issue ? `${issue.path.join(".")} ${issue.message}` : "bad shape"}.`);
    }
    let messages;
    try {
      messages = toModelMessages(parsed.data);
    } catch (err) {
      if (err instanceof RequestValidationError) throw new HttpError(400, "invalid_request", err.message);
      throw err;
    }

    activeChats++;
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(config.ASSISTANT_REQUEST_TIMEOUT_MS)]);
    const onClose = () => {
      if (!res.writableEnded) abort.abort(new Error("client disconnected"));
    };
    res.on("close", onClose);

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-request-id": requestId,
    });
    res.flushHeaders();
    const write = (event: AssistantEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, HEARTBEAT_MS);

    const log = logger.child({ request_id: requestId });
    const started = Date.now();
    try {
      await runChatTurn({ messages, emit: write, signal }, { gateway, tools: { catalog, logger: log }, settings, logger: log });
    } finally {
      clearInterval(heartbeat);
      res.off("close", onClose);
      activeChats--;
      if (!res.writableEnded) res.end();
      log.info("chat_request_done", { ms: Date.now() - started, aborted: abort.signal.aborted, history_len: messages.length });
    }
  }

  async function handleStatic(pathname: string, res: http.ServerResponse) {
    const entry = STATIC_FILES[pathname];
    if (!entry) throw new HttpError(404, "not_found", "Not found.");
    const body = await readFile(path.join(PUBLIC_DIR, entry.file));
    res.writeHead(200, {
      "content-type": entry.type,
      "cache-control": entry.file === "index.html" ? "no-cache" : "public, max-age=300",
      "content-security-policy": UI_CSP,
      "x-frame-options": "DENY",
    });
    res.end(body);
  }

  return http.createServer(async (req, res) => {
    const incomingId = req.headers["x-request-id"];
    const requestId = typeof incomingId === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(incomingId) ? incomingId : randomUUID();
    baseHeaders(res);
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === CHAT_PATH) {
        if (!applyCors(req, res, config.corsAllowedOrigins)) return;
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.", { allow: "POST, OPTIONS" });
        await handleChat(req, res, requestId);
        return;
      }
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { status: "ok", catalog: catalog.name, model: config.ASSISTANT_MODEL });
        return;
      }
      if (req.method === "GET" && url.pathname === "/ready") {
        try {
          await catalog.listMarketplaces();
          sendJson(res, 200, { status: "ready" });
        } catch {
          sendJson(res, 503, { status: "catalog_unavailable" });
        }
        return;
      }
      if (req.method === "GET" && config.SERVE_DEMO_UI) {
        await handleStatic(url.pathname, res);
        return;
      }
      throw new HttpError(404, "not_found", "Not found.");
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status >= 500) logger.warn("http_error", { request_id: requestId, status: err.status, code: err.code });
        sendError(res, err);
        return;
      }
      logger.error("http_unhandled", { request_id: requestId, ...errorFields(err) });
      if (!res.headersSent) sendError(res, new HttpError(500, "internal", "Internal error."));
      else if (!res.writableEnded) res.end();
    }
  });
}
