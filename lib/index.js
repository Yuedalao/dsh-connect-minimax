import { createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { MiniMaxAuthManager } from "./auth.js";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MODELS,
  PLUGIN_NAME,
  PROVIDER_ID,
  PROVIDER_NAME,
  SETTINGS_NS,
  discoveryRows,
  normalizeDataDir,
  normalizeRegion,
  publicStatusFromSnapshot,
  resolveAuthPaths,
  toPiModel
} from "./core.js";
import { createMiniMaxProxy } from "./proxy.js";

export { Config } from "./config.js";

export const name = PLUGIN_NAME;
export const inject = ["llm"];

const ROUTE_PREFIX = `/plugins/${PLUGIN_NAME}/api`;
const STREAM_IDLE_TIMEOUT_MS = 300_000;
const REQUEST_IMAGE_BUDGETS = {
  maxRequestImageBytes: 20_971_520,
  requestImagePixelBudget: 4_194_304,
  requestImageMaxBytes: 1_048_576
};
const INERT_AUTH = {
  credentials: {
    async read() {},
    async list() {
      return [];
    },
    async modify() {
      throw new Error(`${PLUGIN_NAME} does not write pi-ai credentials`);
    },
    async delete() {}
  },
  authContext: {
    async env() {},
    async fileExists() {
      return false;
    }
  }
};

function normalizedConfig(config = {}) {
  return {
    enabled: config.enabled !== false,
    dataDir: normalizeDataDir(config.dataDir, DEFAULT_DATA_DIR),
    region: normalizeRegion(config.region),
    maxOutputTokens: Number.isInteger(config.maxOutputTokens) && config.maxOutputTokens > 0
      ? config.maxOutputTokens
      : DEFAULT_MAX_OUTPUT_TOKENS
  };
}

function createMiniMaxAdapter(ctx, auth, proxy, config) {
  const buildModels = () => MODELS.map((model) => toPiModel(
    model,
    proxy.baseUrl(),
    PROVIDER_ID,
    config.maxOutputTokens
  ));
  const provider = {
    ...createProvider({
      id: PROVIDER_ID,
      name: PROVIDER_NAME,
      auth: {
        apiKey: {
          name: "MiniMax Code 本机代理密钥",
          async resolve({ credential }) {
            const apiKey = credential?.key;
            if (typeof apiKey !== "string" || apiKey.length === 0) return undefined;
            return {
              auth: { apiKey },
              source: "MiniMax Code loopback"
            };
          }
        }
      },
      models: buildModels(),
      api: anthropicMessagesApi()
    }),
    getModels: () => buildModels()
  };
  const profile = {
    provider: PROVIDER_ID,
    displayName: PROVIDER_NAME,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, `${PLUGIN_NAME} retryPolicy`),
    configuredMaxTokens: new Map(),
    modelErrors: new Map(),
    defaultContextWindow: Math.max(...MODELS.map((model) => model.contextWindow)),
    ...REQUEST_IMAGE_BUDGETS,
    piProvider: provider
  };
  return new PiAiAdapter({
    profiles: () => new Map([[PROVIDER_ID, profile]]),
    auth: INERT_AUTH,
    resolveApiKey: async () => proxy.token(),
    resolveAttachments: () => ctx.get("attachments")
  });
}

function registerRoutes(ctx, auth, proxy, config, runtime) {
  ctx.inject(["webServer"], (webCtx) => {
    const webServer = webCtx.webServer;
    if (webServer === undefined || typeof webServer.register !== "function") return;
    const handler = async (req, res) => {
      if (!isLoopback(req)) {
        sendJson(res, 403, { ok: false, error: "loopback requests only" });
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      try {
        if (req.method === "GET" && url.pathname === `${ROUTE_PREFIX}/status`) {
          const snapshot = await auth.status();
          const paths = resolveAuthPaths(config.dataDir, config.region);
          let account;
          let accountError;
          if (snapshot.connected) {
            try {
              account = await auth.resolveIdentity();
            } catch (error) {
              accountError = error instanceof Error ? error.message : String(error);
            }
          }
          sendJson(res, 200, {
            ok: true,
            plugin: PLUGIN_NAME,
            provider: {
              id: PROVIDER_ID,
              name: PROVIDER_NAME,
              enabled: config.enabled,
              proxyReady: runtime.proxyReady,
              registered: runtime.providerRegistered,
              registrationError: runtime.registrationError,
              proxy: proxy.baseUrl(),
              upstream: proxy.upstreamURL
            },
            login: publicStatusFromSnapshot(snapshot, paths),
            account: account === undefined
              ? undefined
              : {
                  displayName: account.userName ?? account.subUserName,
                  maskedId: maskIdentifier(account.realUserID),
                  hasEmail: typeof account.userEmail === "string" && account.userEmail.length > 0
                },
            accountError,
            models: MODELS.map((model) => ({
              id: model.id,
              name: model.name,
              contextWindow: model.contextWindow,
              maxTokens: model.maxTokens,
              inputModalities: [...model.input],
              reasoning: model.reasoning
            }))
          });
          return;
        }
        sendJson(res, 404, { ok: false, error: "unknown MiniMax Code endpoint" });
      } catch (error) {
        ctx.logger.warn(
          `dsh-connect-minimax: status route failed: ${error instanceof Error ? error.message : String(error)}`
        );
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
    ctx.effect(
      () => webServer.register({ kind: "prefix", path: ROUTE_PREFIX, handler }),
      "dsh-connect-minimax: local login status API"
    );
  });
}

export function apply(ctx, rawConfig) {
  const config = normalizedConfig(rawConfig);
  const runtime = {
    proxyReady: false,
    providerRegistered: false,
    registrationError: undefined
  };
  const auth = new MiniMaxAuthManager({
    dataDir: config.dataDir,
    region: config.region
  });
  const proxy = createMiniMaxProxy({
    auth,
    logger: ctx.logger
  });
  registerRoutes(ctx, auth, proxy, config, runtime);

  ctx.inject(["settings"], (settingsCtx) => {
    ctx.effect(() => settingsCtx.settings.configure({ auto: true }, ctx.fiber));
  });

  const handles = [];
  const directoryHandle = ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER_ID,
      displayName: PROVIDER_NAME,
      settingsNs: SETTINGS_NS,
      settingsPath: [],
      declared: false
    }
  ]);
  handles.push(directoryHandle);
  handles.push(ctx.llm.registerModelDiscovery(SETTINGS_NS, async (request) => {
    if (request.provider !== undefined && request.provider !== PROVIDER_ID) return [];
    return discoveryRows(MODELS);
  }));

  ctx.effect(() => () => {
    for (const handle of handles) handle();
    void proxy.close().catch(() => undefined);
  }, "dsh-connect-minimax: local provider lifecycle");

  if (!config.enabled) {
    ctx.logger.info("dsh-connect-minimax: disabled by configuration");
    return;
  }

  void proxy.ready.then(() => {
    runtime.proxyReady = true;
    const adapter = createMiniMaxAdapter(ctx, auth, proxy, config);
    const adapterHandle = ctx.llm.registerAdapter([PROVIDER_ID], adapter);
    handles.push(adapterHandle);
    runtime.providerRegistered = true;
    ctx.logger.info(
      `dsh-connect-minimax: registered ${PROVIDER_ID} via ${proxy.baseUrl()} with local MiniMax Code login`
    );
  }).catch((error) => {
    runtime.registrationError = error instanceof Error ? error.message : String(error);
    ctx.logger.error(
      "dsh-connect-minimax: local reverse proxy failed; provider not registered",
      error
    );
  });
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? "";
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

function maskIdentifier(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (value.length <= 6) return "***";
  return `***${value.slice(-6)}`;
}
