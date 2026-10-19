import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const PLUGIN_NAME = "dsh-connect-minimax";
export const SETTINGS_NS = "minimax";
export const PROVIDER_ID = "minimax-code-local";
export const PROVIDER_NAME = "MiniMax Code（本机登录）";

export const DEFAULT_DATA_DIR = join(homedir(), ".minimax");
export const DEFAULT_REGION = "cn";
export const DEFAULT_BUILD_ENV = "prod";
export const DEFAULT_MODEL = "MiniMax-M3.1-Flash-Preview";
export const DEFAULT_MAX_OUTPUT_TOKENS = 128_000;
export const REFRESH_MIN_VALIDITY_MS = 60_000;
export const MINIMAX_CONTEXT_WINDOWS = Object.freeze([512_000, 1_000_000]);
export const MINIMAX_REASONING_EFFORTS = Object.freeze([
  "default",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);

export const MINIMAX_AGENT_ORIGIN = "https://agent.minimax.cn";
export const MINIMAX_MESSAGES_URL =
  `${MINIMAX_AGENT_ORIGIN}/mavis/api/v1/llm/v1/messages`;
export const MINIMAX_IDENTITY_URL = `${MINIMAX_AGENT_ORIGIN}/v1/api/user/info`;
export const MINIMAX_TOKEN_URL = "https://account.minimax.cn/oauth2/token";

const ZERO_COST = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0
});

const ADAPTIVE_THINKING = Object.freeze({
  off: null,
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
});

const SWITCHABLE_THINKING = Object.freeze({
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
});

export const MODELS = Object.freeze([
  Object.freeze({
    id: "MiniMax-M3.1-Flash-Preview",
    name: "MiniMax M3.1 Flash Preview",
    contextWindow: 512_000,
    contextWindowOptions: MINIMAX_CONTEXT_WINDOWS,
    effortOptions: MINIMAX_REASONING_EFFORTS,
    maxTokens: 128_000,
    input: Object.freeze(["text", "image"]),
    reasoning: true,
    thinkingLevelMap: ADAPTIVE_THINKING,
    forceAdaptiveThinking: true,
    cost: ZERO_COST
  }),
  Object.freeze({
    id: "MiniMax-M3",
    name: "MiniMax M3",
    contextWindow: 512_000,
    contextWindowOptions: MINIMAX_CONTEXT_WINDOWS,
    effortOptions: MINIMAX_REASONING_EFFORTS,
    maxTokens: 128_000,
    input: Object.freeze(["text", "image"]),
    reasoning: true,
    thinkingLevelMap: SWITCHABLE_THINKING,
    forceAdaptiveThinking: true,
    cost: ZERO_COST
  }),
  Object.freeze({
    id: "MiniMax-M2.7-highspeed",
    name: "MiniMax M2.7 Highspeed",
    contextWindow: 200_000,
    maxTokens: 128_000,
    input: Object.freeze(["text"]),
    reasoning: true,
    thinkingLevelMap: ADAPTIVE_THINKING,
    forceAdaptiveThinking: false,
    cost: ZERO_COST
  }),
  Object.freeze({
    id: "MiniMax-M2.7",
    name: "MiniMax M2.7",
    contextWindow: 200_000,
    maxTokens: 128_000,
    input: Object.freeze(["text"]),
    reasoning: true,
    thinkingLevelMap: ADAPTIVE_THINKING,
    forceAdaptiveThinking: false,
    cost: ZERO_COST
  })
]);

export function normalizeDataDir(value, fallback = DEFAULT_DATA_DIR) {
  const candidate = typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
  return resolve(candidate);
}

export function normalizeRegion(value, fallback = DEFAULT_REGION) {
  if (value === "cn" || value === "en") return value;
  return fallback === "en" ? "en" : "cn";
}

export function resolveAuthPaths(dataDir, region = DEFAULT_REGION, buildEnv = DEFAULT_BUILD_ENV) {
  const authRoot = join(normalizeDataDir(dataDir), "auth");
  const namespaceHome = join(authRoot, buildEnv, region, "mcode-public");
  return {
    authRoot,
    namespaceHome,
    credentialPath: join(namespaceHome, "auth.json"),
    statePath: join(namespaceHome, "auth-state.json"),
    lockPath: join(namespaceHome, "auth.lock")
  };
}

export function selectCredentialRecord(authPayload) {
  if (!isRecord(authPayload) || !isRecord(authPayload.records)) return undefined;
  const rows = [];
  for (const [recordKey, value] of Object.entries(authPayload.records)) {
    if (!isRecord(value)) continue;
    if (value.clientId !== "mcode-public") continue;
    if (value.audience !== "agent-backend") continue;
    if (value.tokenType !== "Bearer") continue;
    if (!Array.isArray(value.scopes) || !value.scopes.includes("agent.default")) continue;
    if (typeof value.accessToken !== "string" || value.accessToken.length === 0) continue;
    if (typeof value.refreshToken !== "string" || value.refreshToken.length === 0) continue;
    if (!Number.isFinite(value.expiresAtMs)) continue;
    rows.push({ recordKey, credential: value });
  }
  rows.sort((left, right) => {
    const generationDelta = (right.credential.generation ?? -1) - (left.credential.generation ?? -1);
    if (generationDelta !== 0) return generationDelta;
    return right.credential.expiresAtMs - left.credential.expiresAtMs;
  });
  return rows[0];
}

export function parseAuthSnapshot(authPayload, statePayload, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const selected = selectCredentialRecord(authPayload);
  if (selected === undefined) {
    return {
      status: "missing",
      connected: false,
      nowMs,
      reason: "本机未找到可用的 MiniMax Code 登录记录"
    };
  }
  const state = isRecord(statePayload) ? statePayload : undefined;
  const credential = selected.credential;
  const stateGeneration = Number.isSafeInteger(state?.generation) ? state.generation : undefined;
  const generationMatches = stateGeneration === undefined
    || stateGeneration === credential.generation;
  const expired = credential.expiresAtMs <= nowMs;
  const stateBlocksUse = state?.status === "anonymous"
    || state?.status === "logging_out"
    || state?.status === "logout_pending";
  const connected = !expired && !stateBlocksUse && generationMatches;
  const sessionSeed = `${selected.recordKey}\0${credential.loginEpoch ?? ""}`;
  const sessionFingerprint = createHash("sha256")
    .update(sessionSeed)
    .digest("hex")
    .slice(0, 10);

  return {
    status: connected
      ? "connected"
      : expired
        ? "expired"
        : stateBlocksUse
          ? state.status
          : "mismatch",
    connected,
    expired,
    nowMs,
    recordKey: selected.recordKey,
    sessionFingerprint,
    credential,
    state,
    expiresAtMs: credential.expiresAtMs,
    generation: credential.generation,
    loginEpoch: credential.loginEpoch,
    accountId: credential.accountId,
    subject: credential.subject,
    buildEnv: state?.buildEnv ?? options.buildEnv ?? DEFAULT_BUILD_ENV,
    region: state?.region ?? options.region ?? DEFAULT_REGION,
    generationMatches
  };
}

export function credentialNeedsRefresh(snapshot, minValidityMs = REFRESH_MIN_VALIDITY_MS) {
  if (!snapshot?.connected || !snapshot.credential) return true;
  return snapshot.credential.expiresAtMs - snapshot.nowMs < minValidityMs;
}

export function normalizeTokenGrant(body, previousRefreshToken) {
  if (!isRecord(body)) throw new Error("MiniMax token endpoint returned invalid JSON");
  const accessToken = readString(body.access_token);
  const refreshToken = readString(body.refresh_token) ?? readString(previousRefreshToken);
  const tokenType = readString(body.token_type);
  const expiresInSec = readPositiveNumber(body.expires_in);
  const scopes = parseScopes(body.scope);
  if (!accessToken || !refreshToken || !expiresInSec) {
    throw new Error("MiniMax token endpoint returned an incomplete token grant");
  }
  if (tokenType?.toLowerCase() !== "bearer") {
    throw new Error("MiniMax token endpoint returned an unsupported token type");
  }
  if (!scopes.includes("agent.default")) {
    throw new Error("MiniMax token endpoint did not grant the agent.default scope");
  }
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresInSec,
    scopes,
    audience: "agent-backend"
  };
}

export function mergeRefreshGrant(current, grant, nowMs = Date.now()) {
  const credential = current?.credential;
  const state = current?.state;
  if (!isRecord(credential)) throw new Error("Cannot refresh without a local MiniMax credential");
  if (!isRecord(grant)) throw new Error("Cannot refresh without a MiniMax token grant");
  if (!Number.isFinite(grant.expiresInSec) || grant.expiresInSec <= 0) {
    throw new Error("MiniMax token grant has no positive lifetime");
  }
  const generation = Math.max(
    Number.isSafeInteger(state?.generation) ? state.generation : 0,
    Number.isSafeInteger(credential.generation) ? credential.generation : 0
  ) + 1;
  const nextCredential = {
    ...credential,
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken ?? credential.refreshToken,
    tokenType: "Bearer",
    clientId: "mcode-public",
    scopes: [...grant.scopes],
    audience: "agent-backend",
    expiresAtMs: nowMs + grant.expiresInSec * 1_000,
    generation,
    loginEpoch: credential.loginEpoch,
    ...(grant.subject === undefined ? {} : { subject: grant.subject }),
    ...(grant.accountId === undefined ? {} : { accountId: grant.accountId })
  };
  const { authorization: _authorization, ...stateWithoutAuthorization } = state ?? {};
  const nextState = {
    ...stateWithoutAuthorization,
    schemaVersion: 2,
    status: "authenticated",
    storeKind: "file",
    clientId: "mcode-public",
    scopes: [...nextCredential.scopes],
    audience: "agent-backend",
    buildEnv: current.buildEnv ?? DEFAULT_BUILD_ENV,
    region: current.region ?? DEFAULT_REGION,
    generation,
    expiresAtMs: nextCredential.expiresAtMs
  };
  return { credential: nextCredential, state: nextState };
}

export function contextWindowFor(model, contextBudgets = {}) {
  const requested = readPositiveNumber(contextBudgets?.[model.id]);
  return requested !== undefined && model.contextWindowOptions?.includes(requested)
    ? requested
    : model.contextWindow;
}

export function reasoningEffortFor(model, reasoningEfforts = {}) {
  const requested = reasoningEfforts?.[model.id];
  return typeof requested === "string" && model.effortOptions?.includes(requested)
    ? requested
    : undefined;
}

export function toPiModel(
  model,
  baseUrl,
  provider = PROVIDER_ID,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  contextBudgets = {}
) {
  const outputCap = Number.isInteger(maxOutputTokens) && maxOutputTokens > 0
    ? maxOutputTokens
    : DEFAULT_MAX_OUTPUT_TOKENS;
  return {
    id: model.id,
    name: model.name,
    api: "anthropic-messages",
    provider,
    baseUrl,
    input: [...model.input],
    cost: { ...model.cost },
    reasoning: model.reasoning === true,
    ...model.thinkingLevelMap === undefined
      ? {}
      : { thinkingLevelMap: { ...model.thinkingLevelMap } },
    contextWindow: contextWindowFor(model, contextBudgets),
    maxTokens: Math.min(model.maxTokens, outputCap),
    compat: {
      forceAdaptiveThinking: model.forceAdaptiveThinking === true,
      allowEmptySignature: true,
      supportsStrictTools: false
    }
  };
}

export function discoveryRows(models = MODELS, contextBudgets = {}) {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    contextWindow: contextWindowFor(model, contextBudgets),
    maxTokens: model.maxTokens,
    inputModalities: [...model.input],
    ...model.reasoning
      ? {
          reasoningEfforts: {
            low: "low",
            medium: "medium",
            high: "high"
          }
        }
      : {}
  }));
}

export function publicStatusFromSnapshot(snapshot, paths) {
  return {
    status: snapshot.status,
    connected: snapshot.connected === true,
    expired: snapshot.expired === true,
    expiresAtMs: snapshot.expiresAtMs,
    generation: snapshot.generation,
    accountId: snapshot.accountId,
    subject: snapshot.subject,
    sessionFingerprint: snapshot.sessionFingerprint,
    buildEnv: snapshot.buildEnv,
    region: snapshot.region,
    authPath: paths.credentialPath,
    statePath: paths.statePath,
    reason: snapshot.reason
  };
}

function parseScopes(value) {
  if (typeof value === "string") return value.split(/\s+/u).filter(Boolean);
  if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) {
    return [...value];
  }
  return [];
}

function readString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
