import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { MINIMAX_MESSAGES_URL } from "./core.js";
import { MiniMaxAuthError } from "./auth.js";

const BODY_LIMIT = 64 * 1024 * 1024;

export function createMiniMaxProxy(options) {
  if (!options?.auth) throw new Error("MiniMax proxy requires an auth manager");
  const upstreamUrl = options.upstreamURL ?? MINIMAX_MESSAGES_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveModelPolicy = options.resolveModelPolicy;
  const localToken = randomBytes(32).toString("base64url");
  const sockets = new Set();
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const ready = new Promise((resolvePromise, rejectPromise) => {
    server.once("listening", resolvePromise);
    server.once("error", rejectPromise);
  });
  server.listen(0, "127.0.0.1");

  async function handleRequest(req, res) {
    try {
      if (!isLoopbackHost(req.headers.host)) {
        writeError(res, 403, "permission_error", "Host must be loopback");
        return;
      }
      if (!hasLocalSecret(req, localToken)) {
        writeError(res, 401, "authentication_error", "Invalid local proxy token");
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/healthz") {
        const snapshot = await options.auth.status();
        writeJson(res, 200, {
          ok: true,
          connected: snapshot.connected === true,
          status: snapshot.status
        });
        return;
      }
      if (req.method !== "POST" || url.pathname !== "/v1/messages") {
        writeError(res, 404, "not_found_error", `No such route: ${req.method} ${url.pathname}`);
        return;
      }
      const body = await readBody(req, BODY_LIMIT);
      const preparedBody = applyModelPolicy(body, resolveModelPolicy);
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", abort);
      const upstream = await forwardWithAuthRetry(
        options.auth,
        fetchImpl,
        upstreamUrl,
        preparedBody,
        req.headers,
        controller.signal
      );
      res.statusCode = upstream.status;
      copyResponseHeaders(upstream, res);
      if (upstream.body === null) {
        res.end();
        return;
      }
      const stream = Readable.fromWeb(upstream.body);
      stream.once("error", (error) => {
        options.logger?.warn?.("dsh-connect-minimax: upstream stream failed", {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error)
        });
        if (!res.writableEnded) res.end();
      });
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      const authError = error instanceof MiniMaxAuthError;
      const status = authError
        ? error.code === "AUTH_REQUIRED" || error.code === "AUTH_REJECTED"
          ? 401
          : 502
        : 502;
      const type = authError
        ? error.code === "AUTH_REQUIRED" || error.code === "AUTH_REJECTED"
          ? "authentication_error"
          : "api_error"
        : "api_error";
      writeError(
        res,
        status,
        type,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return {
    ready,
    baseUrl() {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("MiniMax local proxy is not listening");
      }
      return `http://127.0.0.1:${address.port}`;
    },
    token: () => localToken,
    upstreamURL: upstreamUrl,
    close: () => new Promise((resolvePromise, rejectPromise) => {
      for (const socket of sockets) socket.destroy();
      server.close((error) => {
        if (error === undefined) resolvePromise();
        else rejectPromise(error);
      });
    })
  };
}

function applyModelPolicy(body, resolveModelPolicy) {
  if (typeof resolveModelPolicy !== "function" || body.length === 0) return body;
  let parsed;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }
  if (!isRecord(parsed) || typeof parsed.model !== "string") return body;
  const policy = resolveModelPolicy(parsed.model);
  const reasoningEffort = policy?.reasoningEffort;
  if (typeof reasoningEffort !== "string" || reasoningEffort === "") return body;
  const thinking = isRecord(parsed.thinking) ? parsed.thinking : {};
  parsed.thinking = {
    ...thinking,
    type: "adaptive",
    display: thinking.display ?? "summarized"
  };
  parsed.output_config = {
    ...(isRecord(parsed.output_config) ? parsed.output_config : {}),
    effort: reasoningEffort
  };
  return Buffer.from(JSON.stringify(parsed));
}

async function forwardWithAuthRetry(auth, fetchImpl, upstreamUrl, body, incomingHeaders, signal) {
  let lease = await auth.getAccessToken();
  let response = await postUpstream(fetchImpl, upstreamUrl, body, incomingHeaders, lease.accessToken, signal);
  if (response.status !== 401) return response;
  await discardResponse(response);
  lease = await auth.handleUnauthorized(lease.accessToken, lease.loginEpoch);
  response = await postUpstream(fetchImpl, upstreamUrl, body, incomingHeaders, lease.accessToken, signal);
  return response;
}

function postUpstream(fetchImpl, upstreamUrl, body, incomingHeaders, accessToken, signal) {
  const headers = {
    accept: readHeader(incomingHeaders.accept) ?? "application/json, text/event-stream",
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
    "anthropic-version": readHeader(incomingHeaders["anthropic-version"]) ?? "2023-06-01",
    "x-sub-module": "claude-code-internal",
    "user-agent": "MiniMaxCode/3.1.1"
  };
  const beta = readHeader(incomingHeaders["anthropic-beta"]);
  if (beta !== undefined) headers["anthropic-beta"] = beta;
  return fetchImpl(upstreamUrl, {
    method: "POST",
    headers,
    body,
    signal
  });
}

function copyResponseHeaders(upstream, response) {
  for (const [name, value] of upstream.headers.entries()) {
    const lower = name.toLowerCase();
    if (lower === "connection"
      || lower === "content-length"
      || lower === "content-encoding"
      || lower === "transfer-encoding"
      || lower === "set-cookie") {
      continue;
    }
    response.setHeader(name, value);
  }
  response.setHeader("cache-control", "no-store");
}

function hasLocalSecret(req, expectedToken) {
  const apiKey = readHeader(req.headers["x-api-key"]);
  const authorization = readHeader(req.headers.authorization);
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const candidate = apiKey ?? bearer;
  if (!candidate) return false;
  const actual = Buffer.from(candidate);
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isLoopbackHost(host) {
  if (typeof host !== "string") return false;
  return host === "127.0.0.1"
    || host.startsWith("127.0.0.1:")
    || host === "localhost"
    || host.startsWith("localhost:");
}

function readHeader(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readBody(req, limit) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        rejectPromise(new MiniMaxAuthError(
          `MiniMax request body exceeds ${limit} bytes`,
          "REQUEST_TOO_LARGE"
        ));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.once("end", () => resolvePromise(Buffer.concat(chunks)));
    req.once("error", rejectPromise);
  });
}

async function discardResponse(response) {
  if (response.body === null) return;
  await response.body.cancel().catch(() => undefined);
}

function writeJson(res, status, value) {
  const payload = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store"
  });
  res.end(payload);
}

function writeError(res, status, type, message) {
  writeJson(res, status, {
    type: "error",
    error: {
      type,
      message
    }
  });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
