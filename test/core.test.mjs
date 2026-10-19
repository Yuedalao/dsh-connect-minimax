import assert from "node:assert/strict";
import test from "node:test";
import {
  MODELS,
  contextWindowFor,
  credentialNeedsRefresh,
  discoveryRows,
  mergeRefreshGrant,
  normalizeTokenGrant,
  parseAuthSnapshot,
  publicStatusFromSnapshot,
  reasoningEffortFor,
  toPiModel
} from "../lib/core.js";

const recordKey = "com.minimax.mcode.oauth.prod.cn\u0000_account";
const authPayload = {
  schemaVersion: 1,
  records: {
    [recordKey]: {
      schemaVersion: 1,
      accessToken: "access-old",
      refreshToken: "refresh-old",
      tokenType: "Bearer",
      clientId: "mcode-public",
      scopes: ["agent.default"],
      audience: "agent-backend",
      expiresAtMs: 2_000_000,
      generation: 7,
      loginEpoch: "login-epoch",
      futureField: "keep-me"
    }
  }
};
const statePayload = {
  schemaVersion: 2,
  status: "authenticated",
  storeKind: "file",
  clientId: "mcode-public",
  scopes: ["agent.default"],
  audience: "agent-backend",
  buildEnv: "prod",
  region: "cn",
  generation: 7,
  expiresAtMs: 2_000_000,
  futureStateField: "keep-state"
};

test("local MiniMax credential is discovered without exposing tokens", () => {
  const snapshot = parseAuthSnapshot(authPayload, statePayload, { nowMs: 1_000_000 });
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.status, "connected");
  assert.equal(snapshot.loginEpoch, "login-epoch");
  assert.equal(snapshot.sessionFingerprint.length, 10);
  assert.equal(credentialNeedsRefresh(snapshot, 60_000), false);
  const publicStatus = publicStatusFromSnapshot(snapshot, {
    credentialPath: "C:\\auth.json",
    statePath: "C:\\auth-state.json"
  });
  const text = JSON.stringify(publicStatus);
  assert.equal(text.includes("access-old"), false);
  assert.equal(text.includes("refresh-old"), false);
});

test("expired local credentials are reported as expired", () => {
  const snapshot = parseAuthSnapshot(authPayload, statePayload, { nowMs: 2_000_001 });
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.status, "expired");
  assert.equal(credentialNeedsRefresh(snapshot), true);
});

test("refresh grant preserves login identity and unknown credential fields", () => {
  const snapshot = parseAuthSnapshot(authPayload, statePayload, { nowMs: 1_000_000 });
  const grant = normalizeTokenGrant({
    access_token: "access-new",
    token_type: "Bearer",
    expires_in: 3600,
    scope: "agent.default"
  }, snapshot.credential.refreshToken);
  const next = mergeRefreshGrant(snapshot, grant, 1_100_000);
  assert.equal(next.credential.accessToken, "access-new");
  assert.equal(next.credential.refreshToken, "refresh-old");
  assert.equal(next.credential.loginEpoch, "login-epoch");
  assert.equal(next.credential.futureField, "keep-me");
  assert.equal(next.credential.generation, 8);
  assert.equal(next.state.generation, 8);
  assert.equal(next.state.status, "authenticated");
  assert.equal(next.state.futureStateField, "keep-state");
  assert.equal(next.state.expiresAtMs, 4_700_000);
});

test("model metadata matches the local MiniMax Code catalog", () => {
  assert.deepEqual(MODELS.map((model) => model.id), [
    "MiniMax-M3.1-Flash-Preview",
    "MiniMax-M3",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.7"
  ]);
  const flash = toPiModel(MODELS[0], "http://127.0.0.1:1234");
  assert.equal(flash.api, "anthropic-messages");
  assert.deepEqual(flash.input, ["text", "image"]);
  assert.equal(flash.thinkingLevelMap.off, null);
  assert.equal(flash.compat.forceAdaptiveThinking, true);
  const m3 = toPiModel(MODELS[1], "http://127.0.0.1:1234");
  assert.equal(m3.thinkingLevelMap.off, undefined);
  assert.equal(m3.contextWindow, 512_000);
  assert.equal(m3.maxTokens, 128_000);
});

test("native context and effort selections only accept advertised values", () => {
  const flash = MODELS[0];
  const m3 = MODELS[1];
  const budgets = {
    [flash.id]: 1_000_000,
    [m3.id]: 750_000
  };
  assert.equal(contextWindowFor(flash, budgets), 1_000_000);
  assert.equal(contextWindowFor(m3, budgets), 512_000);
  assert.equal(toPiModel(flash, "http://127.0.0.1:1234", undefined, undefined, budgets).contextWindow, 1_000_000);
  assert.equal(discoveryRows([m3], { [m3.id]: 1_000_000 })[0].contextWindow, 1_000_000);
  assert.equal(reasoningEffortFor(flash, { [flash.id]: "default" }), "default");
  assert.equal(reasoningEffortFor(m3, { [m3.id]: "invalid" }), undefined);
  assert.deepEqual(flash.contextWindowOptions, [512_000, 1_000_000]);
  assert.deepEqual(flash.effortOptions, ["default", "low", "medium", "high", "xhigh", "max"]);
});
