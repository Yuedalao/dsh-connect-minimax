import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_BUILD_ENV,
  DEFAULT_DATA_DIR,
  DEFAULT_REGION,
  MINIMAX_IDENTITY_URL,
  REFRESH_MIN_VALIDITY_MS,
  credentialNeedsRefresh,
  mergeRefreshGrant,
  normalizeDataDir,
  normalizeRegion,
  normalizeTokenGrant,
  parseAuthSnapshot,
  resolveAuthPaths
} from "./core.js";

const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_COUNT = 120;
const IDENTITY_TIMEOUT_MS = 3_000;

export class MiniMaxAuthError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = "MiniMaxAuthError";
    this.code = code;
  }
}

export class MiniMaxAuthManager {
  constructor(options = {}) {
    this.dataDir = normalizeDataDir(options.dataDir ?? DEFAULT_DATA_DIR);
    this.region = normalizeRegion(options.region, DEFAULT_REGION);
    this.buildEnv = options.buildEnv === "staging" || options.buildEnv === "test" || options.buildEnv === "dev"
      ? options.buildEnv
      : DEFAULT_BUILD_ENV;
    this.paths = resolveAuthPaths(this.dataDir, this.region, this.buildEnv);
    this.tokenURL = options.tokenURL
      ?? (this.region === "en"
        ? "https://account.minimax.io/oauth2/token"
        : "https://account.minimax.cn/oauth2/token");
    this.identityURL = options.identityURL ?? MINIMAX_IDENTITY_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.refreshPromise = undefined;
  }

  async status() {
    return this.readSnapshot();
  }

  async getAccessToken(options = {}) {
    const minValidityMs = options.minValidityMs ?? REFRESH_MIN_VALIDITY_MS;
    const snapshot = await this.readSnapshot();
    if (snapshot.connected && !credentialNeedsRefresh(snapshot, minValidityMs)) {
      return leaseFromSnapshot(snapshot);
    }
    return this.refresh(snapshot, { minValidityMs });
  }

  async handleUnauthorized(rejectedAccessToken, loginEpoch) {
    if (this.refreshPromise !== undefined) return this.refreshPromise;
    const promise = this.withLock(async () => {
      const current = await this.readSnapshot();
      if (!current.connected || !current.credential) {
        throw new MiniMaxAuthError(
          "MiniMax Code 本机登录不可用，请在不退出账号的前提下检查登录状态",
          "AUTH_REQUIRED"
        );
      }
      if (loginEpoch !== undefined
        && current.loginEpoch !== undefined
        && current.loginEpoch !== loginEpoch) {
        return leaseFromSnapshot(current);
      }
      if (current.credential.accessToken !== rejectedAccessToken
        && current.credential.expiresAtMs > this.now()) {
        return leaseFromSnapshot(current);
      }
      return this.refreshUnderLock(current, { force: true });
    });
    this.refreshPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.refreshPromise === promise) this.refreshPromise = undefined;
    }
  }

  async refresh(observedSnapshot, options = {}) {
    if (this.refreshPromise !== undefined) return this.refreshPromise;
    const promise = this.withLock(async () => {
      const current = await this.readSnapshot();
      if (current.connected
        && !credentialNeedsRefresh(current, options.minValidityMs ?? REFRESH_MIN_VALIDITY_MS)
        && options.force !== true) {
        return leaseFromSnapshot(current);
      }
      if (observedSnapshot?.credential !== undefined
        && current.credential !== undefined
        && observedSnapshot.credential.accessToken !== current.credential.accessToken
        && current.connected
        && !credentialNeedsRefresh(current, options.minValidityMs ?? REFRESH_MIN_VALIDITY_MS)) {
        return leaseFromSnapshot(current);
      }
      return this.refreshUnderLock(current, options);
    });
    this.refreshPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.refreshPromise === promise) this.refreshPromise = undefined;
    }
  }

  async resolveIdentity(options = {}) {
    const lease = await this.getAccessToken({ minValidityMs: 5_000 });
    let response = await this.fetchIdentity(lease.accessToken, options.signal);
    if (response.status === 401 || response.status === 403) {
      await discardResponse(response);
      const replacement = await this.handleUnauthorized(
        lease.accessToken,
        lease.loginEpoch
      );
      response = await this.fetchIdentity(replacement.accessToken, options.signal);
    }
    if (response.status === 401 || response.status === 403) {
      await discardResponse(response);
      throw new MiniMaxAuthError(
        "MiniMax Code 登录凭据被上游拒绝，请重新打开 MiniMax Code 检查登录状态",
        "AUTH_REJECTED"
      );
    }
    if (!response.ok) {
      await discardResponse(response);
      throw new MiniMaxAuthError(
        `MiniMax Code 账号信息读取失败（HTTP ${response.status}）`,
        "IDENTITY_HTTP_ERROR"
      );
    }
    const body = await response.json().catch(() => undefined);
    const statusInfo = isRecord(body?.statusInfo) ? body.statusInfo : undefined;
    const baseResponse = isRecord(body?.base_resp) ? body.base_resp : undefined;
    if (statusInfo?.code === 1000048) {
      throw new MiniMaxAuthError(
        "MiniMax Code 登录凭据被上游拒绝",
        "AUTH_REJECTED"
      );
    }
    if ((statusInfo?.code !== undefined && statusInfo.code !== 0)
      || (baseResponse?.status_code !== undefined && baseResponse.status_code !== 0)) {
      throw new MiniMaxAuthError(
        "MiniMax Code 账号信息请求被上游拒绝",
        "IDENTITY_REJECTED"
      );
    }
    const data = isRecord(body?.data) ? body.data : undefined;
    const user = isRecord(data?.userInfo)
      ? data.userInfo
      : isRecord(data?.user_info)
        ? data.user_info
        : isRecord(body?.userInfo)
          ? body.userInfo
          : isRecord(body?.user_info)
            ? body.user_info
            : undefined;
    const realUserID = readField(user, "realUserID", "real_user_id");
    if (!realUserID) {
      throw new MiniMaxAuthError(
        "MiniMax Code 账号信息中没有用户标识",
        "IDENTITY_INCOMPLETE"
      );
    }
    return {
      userID: readField(user, "userID", "user_id"),
      realUserID,
      userEmail: readField(user, "email", "userMail", "user_email"),
      userName: readField(user, "name", "userName", "user_name"),
      subUserName: readField(user, "subUserName", "sub_user_name")
    };
  }

  async readSnapshot() {
    const [credentialPayload, statePayload] = await Promise.all([
      readJsonFile(this.paths.credentialPath),
      readJsonFile(this.paths.statePath)
    ]);
    const sample = parseAuthSnapshot(credentialPayload, statePayload, {
      nowMs: this.now(),
      region: this.region,
      buildEnv: this.buildEnv
    });
    if (sample.credential === undefined) return sample;
    const reconciledState = reconcileInterruptedState(sample.state, sample.credential);
    if (reconciledState === sample.state) return sample;
    return parseAuthSnapshot(credentialPayload, reconciledState, {
      nowMs: this.now(),
      region: this.region,
      buildEnv: this.buildEnv
    });
  }

  async refreshUnderLock(snapshot, options = {}) {
    if (!snapshot.credential) {
      throw new MiniMaxAuthError(
        "本机没有可刷新的 MiniMax Code 登录记录",
        "AUTH_REQUIRED"
      );
    }
    if (snapshot.connected
      && !credentialNeedsRefresh(snapshot, options.minValidityMs ?? REFRESH_MIN_VALIDITY_MS)
      && options.force !== true) {
      return leaseFromSnapshot(snapshot);
    }
    let response;
    try {
      response = await this.fetchImpl(this.tokenURL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: snapshot.credential.refreshToken,
          client_id: "mcode-public",
          scope: "agent.default",
          audience: "agent-backend"
        }),
        signal: options.signal
      });
    } catch (error) {
      throw new MiniMaxAuthError(
        "MiniMax Code 登录刷新失败，原登录状态保持不变",
        "REFRESH_NETWORK_ERROR",
        { cause: error }
      );
    }
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const oauthError = readField(body, "error");
      if (response.status === 400 && oauthError === "invalid_grant") {
        throw new MiniMaxAuthError(
          "MiniMax Code 登录刷新被上游拒绝；插件没有删除或退出本机登录，请打开 MiniMax Code 检查账号",
          "REFRESH_INVALID_GRANT"
        );
      }
      throw new MiniMaxAuthError(
        `MiniMax Code 登录刷新失败（HTTP ${response.status}），原登录状态保持不变`,
        "REFRESH_HTTP_ERROR"
      );
    }
    let grant;
    try {
      grant = normalizeTokenGrant(body, snapshot.credential.refreshToken);
    } catch (error) {
      throw new MiniMaxAuthError(
        "MiniMax Code 登录刷新返回了无效结果，原登录状态保持不变",
        "REFRESH_INVALID_RESPONSE",
        { cause: error }
      );
    }
    const next = mergeRefreshGrant(snapshot, grant, this.now());
    const nextCredentialPayload = mergeCredentialPayload(
      await readJsonFile(this.paths.credentialPath),
      snapshot.recordKey,
      next.credential
    );
    await atomicWriteJson(this.paths.credentialPath, nextCredentialPayload);
    await atomicWriteJson(this.paths.statePath, next.state);
    return leaseFromSnapshot({
      ...snapshot,
      connected: true,
      expired: false,
      status: "connected",
      credential: next.credential,
      state: next.state,
      expiresAtMs: next.credential.expiresAtMs,
      generation: next.credential.generation,
      nowMs: this.now()
    });
  }

  async fetchIdentity(accessToken, signal) {
    const requestTime = this.now();
    const url = new URL(this.identityURL);
    url.search = new URLSearchParams({
      device_platform: "mcode",
      biz_id: "3",
      app_id: "3001",
      version_code: "22201",
      unix: String(requestTime),
      timezone_offset: String(new Date().getTimezoneOffset() * -60),
      sys_language: "zh",
      lang: "zh",
      device_id: "0",
      os_name: process.platform,
      browser_name: "mcode",
      user_id: "0",
      client: "mcode"
    }).toString();
    const second = Math.floor(requestTime / 1_000);
    const timeoutSignal = AbortSignal.timeout(IDENTITY_TIMEOUT_MS);
    const combinedSignal = signal === undefined
      ? timeoutSignal
      : AbortSignal.any([signal, timeoutSignal]);
    return this.fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "MiniMaxCode",
        authorization: `Bearer ${accessToken}`,
        yy: md5(`${encodeURIComponent(`${url.pathname}${url.search}`)}_${md5(String(requestTime))}ooui`),
        "x-timestamp": String(second),
        "x-signature": md5(`${second}I*7Cf%WZ#S&%1RlZJ&C2`)
      },
      signal: combinedSignal
    });
  }

  async withLock(operation) {
    await ensurePrivateDirectory(this.paths.namespaceHome);
    const lockHandle = await open(this.paths.lockPath, "a", 0o600);
    await lockHandle.close();
    const lockDirectory = `${this.paths.lockPath}.lock`;
    let acquired = false;
    let delayMs = 5;
    try {
      for (let attempt = 0; attempt <= LOCK_RETRY_COUNT; attempt += 1) {
        try {
          await mkdir(lockDirectory);
          acquired = true;
          break;
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
          const lockStat = await stat(lockDirectory).catch(() => undefined);
          if (lockStat !== undefined && Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
            const expectedLock = resolve(lockDirectory);
            if (expectedLock === resolve(`${this.paths.lockPath}.lock`)) {
              await rm(lockDirectory, { recursive: true, force: true });
            }
            continue;
          }
          await sleep(delayMs);
          delayMs = Math.min(250, Math.max(5, Math.ceil(delayMs * 1.15)));
        }
      }
      if (!acquired) {
        throw new MiniMaxAuthError(
          "等待 MiniMax Code 登录锁超时，未修改任何登录数据",
          "AUTH_LOCK_TIMEOUT"
        );
      }
      return await operation();
    } finally {
      if (acquired) await rm(lockDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function leaseFromSnapshot(snapshot) {
  if (!snapshot.credential) {
    throw new MiniMaxAuthError(
      "MiniMax Code 本机登录不可用",
      "AUTH_REQUIRED"
    );
  }
  return {
    accessToken: snapshot.credential.accessToken,
    loginEpoch: snapshot.loginEpoch,
    generation: snapshot.credential.generation,
    expiresAtMs: snapshot.credential.expiresAtMs
  };
}

function mergeCredentialPayload(payload, recordKey, credential) {
  const base = isRecord(payload) && isRecord(payload.records)
    ? payload
    : { schemaVersion: 1, records: {} };
  return {
    ...base,
    schemaVersion: 1,
    records: {
      ...base.records,
      [recordKey]: credential
    }
  };
}

function reconcileInterruptedState(state, credential) {
  if (!isRecord(state)) return state;
  if (state.generation === credential.generation) return state;
  if ((state.status === "refreshing" || state.status === "authorizing")
    && credential.generation > (state.generation ?? 0)) {
    return {
      ...state,
      status: "authenticated",
      generation: credential.generation,
      scopes: [...credential.scopes],
      expiresAtMs: credential.expiresAtMs
    };
  }
  return state;
}

async function readJsonFile(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new MiniMaxAuthError(
      `MiniMax Code 登录文件格式无效：${path}`,
      "AUTH_FILE_INVALID",
      { cause: error }
    );
  }
}

async function atomicWriteJson(path, value) {
  const directory = dirname(path);
  await ensurePrivateDirectory(directory);
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (process.platform !== "win32") await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
}

async function discardResponse(response) {
  if (response.body === null) return;
  await response.body.cancel().catch(() => undefined);
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function readField(value, ...keys) {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
  }
  return undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(durationMs) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
}
