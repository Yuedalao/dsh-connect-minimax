import { createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { MiniMaxAuthManager } from "./auth.js";
import { MiniMaxCreditClient } from "./credits.js";
import { providerDisplayNameWithCredit } from "./provider-credit.js";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MINIMAX_REASONING_EFFORTS,
  MODELS,
  PLUGIN_NAME,
  PROVIDER_ID,
  PROVIDER_NAME,
  SETTINGS_NS,
  contextWindowFor,
  discoveryRows,
  normalizeDataDir,
  normalizeRegion,
  publicStatusFromSnapshot,
  reasoningEffortFor,
  resolveAuthPaths,
  toPiModel
} from "./core.js";
import { createMiniMaxProxy } from "./proxy.js";

export { Config } from "./config.js";

export const name = PLUGIN_NAME;
export const inject = ["llm"];

const ROUTE_PREFIX = `/plugins/${PLUGIN_NAME}/api`;
const STREAM_IDLE_TIMEOUT_MS = 300_000;
const PROVIDER_CREDIT_REFRESH_MS = 5 * 60_000;
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
  const source = unwrapVolatileDeep(config);
  return {
    enabled: source.enabled !== false,
    dataDir: normalizeDataDir(source.dataDir, DEFAULT_DATA_DIR),
    region: normalizeRegion(source.region),
    maxOutputTokens: Number.isInteger(source.maxOutputTokens) && source.maxOutputTokens > 0
      ? source.maxOutputTokens
      : DEFAULT_MAX_OUTPUT_TOKENS,
    contextBudgets: normalizeContextBudgets(source.contextBudgets),
    reasoningEfforts: normalizeReasoningEfforts(source.reasoningEfforts)
  };
}

function createMiniMaxAdapter(ctx, auth, proxy, config) {
  let providerName = PROVIDER_NAME;
  const buildModels = () => {
    const live = normalizedConfig(config);
    return MODELS.map((model) => toPiModel(
      model,
      proxy.baseUrl(),
      PROVIDER_ID,
      live.maxOutputTokens,
      live.contextBudgets
    ));
  };
  let provider = {
    ...createProvider({
      id: PROVIDER_ID,
      name: providerName,
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
    displayName: providerName,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, `${PLUGIN_NAME} retryPolicy`),
    configuredMaxTokens: new Map(),
    modelErrors: new Map(),
    defaultContextWindow: Math.max(...MODELS.map((model) => model.contextWindow)),
    ...REQUEST_IMAGE_BUDGETS,
    piProvider: provider
  };
  const adapter = new PiAiAdapter({
    profiles: () => new Map([[PROVIDER_ID, profile]]),
    auth: INERT_AUTH,
    resolveApiKey: async () => proxy.token(),
    resolveAttachments: () => ctx.get("attachments")
  });
  return {
    adapter,
    setDisplayName(next) {
      const normalized = next.trim();
      if (normalized === "" || normalized === providerName) return false;
      providerName = normalized;
      profile.displayName = normalized;
      provider = { ...provider, name: normalized };
      profile.piProvider = provider;
      adapter.invalidate();
      return true;
    }
  };
}

function registerRoutes(ctx, auth, proxy, config, runtime, creditClient) {
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
          const live = normalizedConfig(config);
          const snapshot = await auth.status();
          const paths = resolveAuthPaths(live.dataDir, live.region);
          let account;
          let accountError;
          if (snapshot.connected) {
            try {
              account = await auth.resolveIdentity();
            } catch (error) {
              accountError = error instanceof Error ? error.message : String(error);
            }
          }
          let credits;
          let creditsError;
          try {
            credits = await creditClient.read();
            runtime.setCredit?.(credits);
          } catch (error) {
            creditsError = error instanceof Error ? error.message : String(error);
          }
          sendJson(res, 200, {
            ok: true,
            plugin: PLUGIN_NAME,
            provider: {
              id: PROVIDER_ID,
              name: PROVIDER_NAME,
              enabled: live.enabled,
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
            credits,
            creditsError,
            models: MODELS.map((model) => ({
              id: model.id,
              name: model.name,
              contextWindow: contextWindowFor(model, live.contextBudgets),
              contextWindowOptions: [...(model.contextWindowOptions ?? [model.contextWindow])],
              contextWindowOptionHints: model.id.startsWith("MiniMax-M3")
                ? { "1000000": "higher_usage" }
                : {},
              maxTokens: model.maxTokens,
              inputModalities: [...model.input],
              reasoning: model.reasoning,
              reasoningEffort: reasoningEffortFor(model, live.reasoningEfforts) ?? null,
              reasoningEffortOptions: [...(model.effortOptions ?? [])]
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
  const config = rawConfig ?? {};
  const initialConfig = normalizedConfig(config);
  const runtime = {
    proxyReady: false,
    providerRegistered: false,
    registrationError: undefined,
    invalidateAdapter: undefined,
    adapterHandle: undefined,
    setCredit: undefined,
    lastCreditRefreshAtMs: 0,
    inflightCredit: undefined,
    creditTimer: undefined,
    stopped: false
  };
  const auth = new MiniMaxAuthManager({
    dataDir: initialConfig.dataDir,
    region: initialConfig.region
  });
  const creditClient = new MiniMaxCreditClient({ auth });
  const proxy = createMiniMaxProxy({
    auth,
    logger: ctx.logger,
    resolveModelPolicy: (modelId) => {
      const model = MODELS.find((candidate) => candidate.id === modelId);
      if (model === undefined) return {};
      const live = normalizedConfig(config);
      return {
        reasoningEffort: reasoningEffortFor(model, live.reasoningEfforts)
      };
    }
  });
  registerRoutes(ctx, auth, proxy, config, runtime, creditClient);

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
    return discoveryRows(MODELS, normalizedConfig(config).contextBudgets);
  }));

  const refreshProviderCredit = async (force = false) => {
    if (runtime.stopped || !runtime.providerRegistered) return;
    if (!force
      && Date.now() - runtime.lastCreditRefreshAtMs < PROVIDER_CREDIT_REFRESH_MS) {
      return;
    }
    if (runtime.inflightCredit !== undefined) return runtime.inflightCredit;
    runtime.lastCreditRefreshAtMs = Date.now();
    let run;
    run = (async () => {
      try {
        const credits = await creditClient.read();
        if (runtime.stopped) return;
        runtime.setCredit?.(credits);
      } catch (error) {
        if (runtime.stopped) return;
        ctx.logger.warn(
          "dsh-connect-minimax: provider balance unavailable",
          error
        );
      }
    })().finally(() => {
      if (runtime.inflightCredit === run) runtime.inflightCredit = undefined;
    });
    runtime.inflightCredit = run;
    return run;
  };

  ctx.on("loader/volatile-update", () => {
    runtime.invalidateAdapter?.();
    void refreshProviderCredit(true);
  });

  ctx.effect(() => () => {
    runtime.stopped = true;
    if (runtime.creditTimer !== undefined) clearInterval(runtime.creditTimer);
    runtime.creditTimer = undefined;
    for (const handle of handles) handle();
    void proxy.close().catch(() => undefined);
  }, "dsh-connect-minimax: local provider lifecycle");

  if (!initialConfig.enabled) {
    ctx.logger.info("dsh-connect-minimax: disabled by configuration");
    return;
  }

  void proxy.ready.then(() => {
    if (runtime.stopped) return;
    runtime.proxyReady = true;
    const adapterView = createMiniMaxAdapter(ctx, auth, proxy, config);
    runtime.invalidateAdapter = () => adapterView.adapter.invalidate();
    const adapterHandle = ctx.llm.registerAdapter([PROVIDER_ID], adapterView.adapter);
    runtime.adapterHandle = adapterHandle;
    handles.push(adapterHandle);
    runtime.providerRegistered = true;
    runtime.setCredit = (credits) => {
      const heading = providerDisplayNameWithCredit(
        PROVIDER_NAME,
        credits?.remainingCredits
      );
      if (!adapterView.setDisplayName(heading)) return;
      adapterHandle.replace([PROVIDER_ID]);
    };
    void refreshProviderCredit(true);
    runtime.creditTimer = setInterval(() => {
      void refreshProviderCredit();
    }, PROVIDER_CREDIT_REFRESH_MS);
    runtime.creditTimer.unref?.();
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

function unwrapVolatileDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof value.get === "function") return unwrapVolatileDeep(value.get());
  if (Array.isArray(value)) return value.map((entry) => unwrapVolatileDeep(entry));
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = unwrapVolatileDeep(entry);
  }
  return output;
}

function normalizeContextBudgets(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const output = {};
  for (const model of MODELS) {
    const candidate = value[model.id];
    if (Number.isSafeInteger(candidate) && model.contextWindowOptions?.includes(candidate)) {
      output[model.id] = candidate;
    }
  }
  return output;
}

function normalizeReasoningEfforts(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const output = {};
  for (const model of MODELS) {
    const candidate = value[model.id];
    if (typeof candidate === "string"
      && MINIMAX_REASONING_EFFORTS.includes(candidate)
      && model.effortOptions?.includes(candidate)) {
      output[model.id] = candidate;
    }
  }
  return output;
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
