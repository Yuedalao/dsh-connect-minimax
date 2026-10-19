import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { MiniMaxAuthManager } from "../lib/auth.js";

const tempRoot = process.env.AGENTSPACE_TMP ?? "E:\\AgentSpace\\tmp";
const recordKey = "com.minimax.mcode.oauth.prod.cn\u0000_account";

test("invalid refresh grant never deletes or rewrites the local login", async (t) => {
  const root = await mkdtemp(join(tempRoot, "dcm-auth-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = await seedAuth(root, {
    expiresAtMs: 1_000,
    generation: 4,
    status: "expired",
    stateGeneration: 4
  });
  const beforeCredential = await readFile(paths.credentialPath, "utf8");
  const beforeState = await readFile(paths.statePath, "utf8");
  const auth = new MiniMaxAuthManager({
    dataDir: join(root, ".minimax"),
    now: () => 2_000,
    fetchImpl: async () => new Response(JSON.stringify({
      error: "invalid_grant"
    }), {
      status: 400,
      headers: { "content-type": "application/json" }
    })
  });
  await assert.rejects(
    () => auth.getAccessToken(),
    (error) => error?.code === "REFRESH_INVALID_GRANT"
  );
  assert.equal(await readFile(paths.credentialPath, "utf8"), beforeCredential);
  assert.equal(await readFile(paths.statePath, "utf8"), beforeState);
});

test("successful refresh preserves login epoch and unknown fields under the shared lock", async (t) => {
  const root = await mkdtemp(join(tempRoot, "dcm-auth-refresh-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = await seedAuth(root, {
    expiresAtMs: 1_000,
    generation: 9,
    status: "expired",
    stateGeneration: 9
  });
  const auth = new MiniMaxAuthManager({
    dataDir: join(root, ".minimax"),
    now: () => 10_000,
    fetchImpl: async () => new Response(JSON.stringify({
      access_token: "access-new",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "agent.default"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  });
  const lease = await auth.getAccessToken();
  assert.equal(lease.accessToken, "access-new");
  const credentialPayload = JSON.parse(await readFile(paths.credentialPath, "utf8"));
  const statePayload = JSON.parse(await readFile(paths.statePath, "utf8"));
  const credential = credentialPayload.records[recordKey];
  assert.equal(credential.refreshToken, "refresh-old");
  assert.equal(credential.loginEpoch, "login-epoch");
  assert.equal(credential.futureField, "keep-me");
  assert.equal(credential.generation, 10);
  assert.equal(statePayload.generation, 10);
  assert.equal(statePayload.status, "authenticated");
  assert.equal(statePayload.futureStateField, "keep-state");
  await assert.rejects(readFile(`${paths.lockPath}.lock`, "utf8"), (error) => error?.code === "ENOENT");
});

async function seedAuth(root, options) {
  const namespaceHome = join(root, ".minimax", "auth", "prod", "cn", "mcode-public");
  await mkdir(namespaceHome, { recursive: true });
  const credentialPath = join(namespaceHome, "auth.json");
  const statePath = join(namespaceHome, "auth-state.json");
  const lockPath = join(namespaceHome, "auth.lock");
  await writeFile(credentialPath, `${JSON.stringify({
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
        expiresAtMs: options.expiresAtMs,
        generation: options.generation,
        loginEpoch: "login-epoch",
        futureField: "keep-me"
      }
    }
  }, null, 2)}\n`, "utf8");
  await writeFile(statePath, `${JSON.stringify({
    schemaVersion: 2,
    status: options.status,
    storeKind: "file",
    clientId: "mcode-public",
    scopes: ["agent.default"],
    audience: "agent-backend",
    buildEnv: "prod",
    region: "cn",
    generation: options.stateGeneration,
    expiresAtMs: options.expiresAtMs,
    futureStateField: "keep-state"
  }, null, 2)}\n`, "utf8");
  await writeFile(lockPath, "", "utf8");
  return { credentialPath, statePath, lockPath };
}
