export const MINIMAX_CREDIT_URL =
  "https://www.minimaxi.com/backend/account/token_plan_credit";
export const MINIMAX_CREDIT_TIMEOUT_MS = 8_000;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the read-only balance document without retaining any credential-like
 * fields the endpoint may include. In particular, `api_key` is never exposed.
 */
export function parseMiniMaxCredits(value) {
  if (!isRecord(value)) return undefined;
  const base = isRecord(value.base_resp) ? value.base_resp : undefined;
  if (base !== undefined
    && typeof base.status_code === "number"
    && base.status_code !== 0) {
    throw new Error(
      `MiniMax credit endpoint rejected the request (${base.status_code})`
    );
  }
  const breakdown = isRecord(value.balance_breakdown)
    ? value.balance_breakdown
    : undefined;
  const remainingCredits =
    finiteNumber(value.remaining_credits)
    ?? finiteNumber(breakdown?.total_balance);
  if (remainingCredits === undefined) return undefined;
  return {
    remainingCredits,
    ...finiteNumber(value.total_credits) === undefined
      ? {}
      : { totalCredits: value.total_credits },
    ...finiteNumber(value.used_credits) === undefined
      ? {}
      : { usedCredits: value.used_credits },
    ...value.token_plan_credit_fallback_enabled === true
      ? { fallbackEnabled: true }
      : {}
  };
}

export class MiniMaxCreditClient {
  constructor(options) {
    this.auth = options.auth;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.url = options.url ?? MINIMAX_CREDIT_URL;
    this.timeoutMs = options.timeoutMs ?? MINIMAX_CREDIT_TIMEOUT_MS;
  }

  async read(options = {}) {
    if (this.auth.region !== "cn") return undefined;
    const lease = await this.auth.getAccessToken({ minValidityMs: 5_000 });
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal === undefined
      ? timeoutSignal
      : AbortSignal.any([options.signal, timeoutSignal]);
    const response = await this.fetchImpl(this.url, {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        origin: "https://www.minimaxi.com",
        referer: "https://www.minimaxi.com/",
        "user-agent": "MiniMaxCode",
        authorization: `Bearer ${lease.accessToken}`
      },
      signal
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`MiniMax credit endpoint returned HTTP ${response.status}`);
    }
    return parseMiniMaxCredits(await response.json().catch(() => undefined));
  }
}
