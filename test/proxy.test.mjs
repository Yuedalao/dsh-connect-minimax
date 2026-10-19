import assert from "node:assert/strict";
import test from "node:test";
import { createMiniMaxProxy } from "../lib/proxy.js";

test("loopback proxy injects the local MiniMax bearer and required headers", async (t) => {
  const calls = [];
  const auth = {
    async status() {
      return { connected: true, status: "connected" };
    },
    async getAccessToken() {
      return { accessToken: "upstream-token", loginEpoch: "epoch", generation: 1 };
    },
    async handleUnauthorized() {
      throw new Error("unexpected refresh");
    }
  };
  const proxy = createMiniMaxProxy({
    auth,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "OK" }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await proxy.ready;
  t.after(() => proxy.close());
  const response = await fetch(`${proxy.baseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": proxy.token()
    },
    body: JSON.stringify({ model: "MiniMax-M3", stream: false })
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.authorization, "Bearer upstream-token");
  assert.equal(calls[0].options.headers["x-sub-module"], "claude-code-internal");
  assert.equal(calls[0].options.headers["anthropic-version"], "2023-06-01");
});

test("configured native effort overrides DSH with adaptive output_config", async (t) => {
  let upstreamBody;
  const auth = {
    async status() {
      return { connected: true, status: "connected" };
    },
    async getAccessToken() {
      return { accessToken: "upstream-token", loginEpoch: "epoch", generation: 1 };
    }
  };
  const proxy = createMiniMaxProxy({
    auth,
    resolveModelPolicy: (model) => model === "MiniMax-M3.1-Flash-Preview"
      ? { reasoningEffort: "default" }
      : {},
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body.toString("utf8"));
      return new Response(JSON.stringify({ type: "message" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await proxy.ready;
  t.after(() => proxy.close());
  const response = await fetch(`${proxy.baseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": proxy.token()
    },
    body: JSON.stringify({
      model: "MiniMax-M3.1-Flash-Preview",
      messages: [{ role: "user", content: "hi" }],
      output_config: { effort: "medium" },
      stream: false
    })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(upstreamBody.thinking, {
    type: "adaptive",
    display: "summarized"
  });
  assert.deepEqual(upstreamBody.output_config, { effort: "default" });
});

test("one upstream 401 triggers exactly one local credential refresh and retry", async (t) => {
  let fetchCount = 0;
  let refreshCount = 0;
  const auth = {
    async status() {
      return { connected: true, status: "connected" };
    },
    async getAccessToken() {
      return { accessToken: "old-token", loginEpoch: "epoch", generation: 2 };
    },
    async handleUnauthorized(rejected, epoch) {
      refreshCount += 1;
      assert.equal(rejected, "old-token");
      assert.equal(epoch, "epoch");
      return { accessToken: "new-token", loginEpoch: "epoch", generation: 3 };
    }
  };
  const proxy = createMiniMaxProxy({
    auth,
    fetchImpl: async (_url, options) => {
      fetchCount += 1;
      if (fetchCount === 1) {
        assert.equal(options.headers.authorization, "Bearer old-token");
        return new Response(JSON.stringify({ type: "error" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
      assert.equal(options.headers.authorization, "Bearer new-token");
      return new Response(JSON.stringify({ type: "message" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await proxy.ready;
  t.after(() => proxy.close());
  const response = await fetch(`${proxy.baseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${proxy.token()}`
    },
    body: JSON.stringify({ model: "MiniMax-M3", stream: false })
  });
  assert.equal(response.status, 200);
  assert.equal(fetchCount, 2);
  assert.equal(refreshCount, 1);
});

test("SSE response bytes are streamed back unchanged", async (t) => {
  const body = [
    "event: message_start",
    "data: {\"type\":\"message_start\"}",
    "",
    "event: message_stop",
    "data: {\"type\":\"message_stop\"}",
    "",
    ""
  ].join("\n");
  const auth = {
    async status() {
      return { connected: true, status: "connected" };
    },
    async getAccessToken() {
      return { accessToken: "upstream-token", loginEpoch: "epoch", generation: 1 };
    }
  };
  const proxy = createMiniMaxProxy({
    auth,
    fetchImpl: async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    })
  });
  await proxy.ready;
  t.after(() => proxy.close());
  const response = await fetch(`${proxy.baseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": proxy.token()
    },
    body: JSON.stringify({ model: "MiniMax-M3", stream: true })
  });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(await response.text(), body);
});
