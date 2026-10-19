import assert from "node:assert/strict";
import test from "node:test";
import {
  MINIMAX_CREDIT_URL,
  MiniMaxCreditClient,
  parseMiniMaxCredits
} from "../lib/credits.js";
import { providerDisplayNameWithCredit } from "../lib/provider-credit.js";

test("parses only the balance fields and never retains api_key", () => {
  const parsed = parseMiniMaxCredits({
    total_credits: 1200,
    used_credits: 200,
    remaining_credits: 1000,
    api_key: "must-not-survive",
    balance_breakdown: {
      total_balance: 1000,
      buckets: []
    },
    token_plan_credit_fallback_enabled: true,
    base_resp: {
      status_code: 0,
      status_msg: "success"
    }
  });
  assert.deepEqual(parsed, {
    remainingCredits: 1000,
    totalCredits: 1200,
    usedCredits: 200,
    fallbackEnabled: true
  });
});

test("reads the local login balance from the official desktop endpoint", async () => {
  let request;
  const client = new MiniMaxCreditClient({
    auth: {
      region: "cn",
      async getAccessToken() {
        return { accessToken: "access-token" };
      }
    },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        remaining_credits: 42,
        total_credits: 50,
        used_credits: 8,
        api_key: "ignore-me",
        base_resp: { status_code: 0 }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  assert.deepEqual(await client.read(), {
    remainingCredits: 42,
    totalCredits: 50,
    usedCredits: 8
  });
  assert.equal(request.url, MINIMAX_CREDIT_URL);
  assert.equal(request.init.headers.authorization, "Bearer access-token");
});

test("aborts a stalled balance request after its own timeout", async () => {
  const client = new MiniMaxCreditClient({
    auth: {
      region: "cn",
      async getAccessToken() {
        return { accessToken: "access-token" };
      }
    },
    timeoutMs: 10,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => reject(init.signal.reason),
        { once: true }
      );
    })
  });
  await assert.rejects(
    client.read(),
    error => error?.name === "TimeoutError"
  );
});

test("formats provider headings without inventing a balance", () => {
  assert.equal(
    providerDisplayNameWithCredit("MiniMax Code（本机登录）", 0),
    "MiniMax Code（本机登录） · 0"
  );
  assert.equal(
    providerDisplayNameWithCredit("MiniMax Code（本机登录）", 1234.5),
    "MiniMax Code（本机登录） · 1,234.5"
  );
  assert.equal(
    providerDisplayNameWithCredit("MiniMax Code（本机登录）", undefined),
    "MiniMax Code（本机登录）"
  );
});
