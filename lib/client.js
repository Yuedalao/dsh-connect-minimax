window.__ModuleLoader__.load({
  id: "dsh-connect-minimax",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const h = React.createElement;
    const API_BASE = "/plugins/dsh-connect-minimax/api";
    let settingsScope;
    const CSS = `
.dcm-section{display:flex;flex-direction:column;gap:14px;max-width:860px;color:var(--dsw-alias-label-primary,#111827)}
.dcm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.dcm-title{margin:0;font-size:18px;line-height:26px;font-weight:650}
.dcm-subtitle{margin:3px 0 0;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;line-height:18px}
.dcm-refresh{height:32px;border:1px solid var(--dsw-alias-border-l3,#d1d5db);border-radius:8px;background:transparent;color:inherit;padding:0 12px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dcm-refresh:disabled{opacity:.45;cursor:default}
.dcm-panel{border:1px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:8px;padding:14px;background:var(--dsw-alias-bg-layer-2,#f8fafc);display:flex;flex-direction:column;gap:12px}
.dcm-statusline{display:flex;align-items:center;gap:8px;min-width:0}
.dcm-dot{width:8px;height:8px;border-radius:999px;background:var(--dsw-alias-label-dimmed,#9ca3af);flex:0 0 auto}
.dcm-dot.on{background:var(--dsw-alias-state-success-primary,#16a34a)}
.dcm-dot.warn{background:var(--dsw-alias-state-warning-primary,#d97706)}
.dcm-status{font-size:14px;line-height:22px;font-weight:650}
.dcm-note{margin:0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dcm-meta{display:grid;grid-template-columns:128px minmax(0,1fr);gap:7px 14px;font-size:12px;line-height:18px}
.dcm-key{color:var(--dsw-alias-label-tertiary,#6b7280)}
.dcm-value{min-width:0;word-break:break-all;color:var(--dsw-alias-label-secondary,#4b5563)}
.dcm-models{display:flex;flex-direction:column;gap:8px}
.dcm-model{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-top:10px;font-size:12px;line-height:18px}
.dcm-model:first-child{border-top:0;padding-top:0}
.dcm-model-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.dcm-model-name{font-weight:600;color:var(--dsw-alias-label-primary,#111827)}
.dcm-model-meta{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-tertiary,#6b7280);flex-wrap:wrap;justify-content:flex-end}
.dcm-chip{border:1px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:999px;padding:1px 7px;font-size:10px;line-height:16px;white-space:nowrap}
.dcm-controls{display:flex;align-items:center;justify-content:space-between;gap:10px 18px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dcm-control{display:flex;align-items:center;gap:7px;min-width:0;color:var(--dsw-alias-label-secondary,#4b5563)}
.dcm-control-label{flex:0 0 auto;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dcm-choices{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.dcm-choice{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border:1px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;line-height:18px;cursor:pointer}
.dcm-choice[data-active="true"]{border-color:var(--dsw-alias-brand-primary,#2563eb);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 12%,transparent);color:var(--dsw-alias-label-primary,#111827)}
.dcm-choice:disabled{opacity:.45;cursor:default}
.dcm-select{height:28px;min-width:112px;border:1px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111827);padding:0 7px;font:inherit;font-size:11px}
.dcm-select:disabled{opacity:.45}
.dcm-save-note{margin:0;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;line-height:16px}
.dcm-bulk{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dcm-secondary{height:28px;border:1px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:7px;background:transparent;color:inherit;padding:0 9px;font:inherit;font-size:11px;cursor:pointer}
.dcm-secondary:disabled{opacity:.45;cursor:default}
.dcm-message{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dcm-message.error{color:var(--dsw-alias-state-error-primary,#dc2626)}
.dcm-message.warn{color:var(--dsw-alias-state-warning-primary,#b45309)}
.dcm-loading{padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary,#6b7280)}
@media(max-width:680px){.dcm-head{flex-direction:column}.dcm-meta{grid-template-columns:1fr;gap:2px}.dcm-key{margin-top:6px}.dcm-model-head{align-items:flex-start;flex-direction:column;gap:4px}.dcm-model-meta{justify-content:flex-start}.dcm-controls{align-items:flex-start;flex-direction:column}.dcm-control{width:100%;justify-content:space-between}.dcm-select{max-width:58%}}
`;

    function ensureStyles() {
      if (typeof document === "undefined" || document.querySelector("style[data-dsh-connect-minimax]")) return;
      const style = document.createElement("style");
      style.dataset.dshConnectMinimax = "";
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    function isChinese() {
      const lang = typeof document === "undefined" ? "zh" : document.documentElement.lang;
      return !lang || /^zh/i.test(lang);
    }

    async function request(path) {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { accept: "application/json" }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok === false) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      return body;
    }

    function createSettingsScope(ctx) {
      let current;
      let currentOff;
      let refreshedOnce = false;
      const listeners = new Set();
      const notify = () => {
        for (const listener of [...listeners]) listener();
      };
      const scope = {
        getSnapshot: () => current?.getSnapshot() ?? {
          status: "unavailable",
          value: undefined,
          writable: false
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set: (field, value) => current !== undefined
          ? current.set(field, value)
          : Promise.resolve(false)
      };
      const rebind = () => {
        const forms = ctx.get("configForms");
        let served;
        try {
          served = (forms?.describe().getSnapshot().view?.namespaces ?? [])
            .find((entry) => entry.ns === "minimax" || /minimax/i.test(entry.ns));
        } catch {
          served = undefined;
        }
        const next = served === undefined || forms === undefined ? undefined : forms.get(served.ns);
        if (next !== current) {
          currentOff?.();
          current = next;
          currentOff = current?.subscribe(notify);
          notify();
        }
        if (next === undefined && !refreshedOnce) {
          refreshedOnce = true;
          try {
            forms?.describe().load?.();
          } catch {}
        }
      };
      rebind();
      try {
        ctx.get("configForms")?.describe().subscribe?.(rebind);
      } catch {}
      return scope;
    }

    function useSettingsSnapshot(scope) {
      const read = () => scope?.getSnapshot() ?? {
        status: "unavailable",
        value: undefined,
        writable: false
      };
      const [snapshot, setSnapshot] = React.useState(read);
      React.useEffect(() => {
        if (!scope) return undefined;
        const update = () => setSnapshot(scope.getSnapshot());
        update();
        return scope.subscribe(update);
      }, [scope]);
      return snapshot;
    }

    function unwrapVolatileDeep(value) {
      if (value === null || typeof value !== "object") return value;
      if (typeof value.get === "function") return unwrapVolatileDeep(value.get());
      if (Array.isArray(value)) return value.map((entry) => unwrapVolatileDeep(entry));
      const output = {};
      for (const [key, entry] of Object.entries(value)) output[key] = unwrapVolatileDeep(entry);
      return output;
    }

    function mapOf(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    }

    function MiniMaxSettings(props = {}) {
      const chinese = isChinese();
      const copy = chinese ? {
        title: "MiniMax Code",
        subtitle: "读取本机 MiniMax Code 登录态，经 127.0.0.1 反向代理调用；不在 DSH 保存 API Key。",
        loading: "正在读取本机 MiniMax Code 登录状态…",
        refresh: "重新读取",
        refreshing: "读取中…",
        connected: "本机登录已连接",
        expired: "本机登录已过期",
        missing: "未找到本机登录",
        mismatch: "登录文件不同步",
        disabled: "插件已关闭",
        account: "当前账号",
        session: "本机会话",
        expires: "凭据有效期",
        authFile: "登录文件",
        provider: "DSH 路由",
        upstream: "本地反代目标",
        models: "可用模型",
        connectedHint: "DSH 会优先使用本机凭据；仅在即将过期或上游返回 401 时刷新一次。",
        stopHint: "插件不会退出 MiniMax Code，不会删除或覆盖账号；如登录失效，请在 MiniMax Code 中重新登录。",
        disabledHint: "插件当前关闭。开启后才会在 DSH 模型选择器中注册 provider。",
        accountUnavailable: "账号信息暂不可用，但本机凭据会被读取。",
        loadFailed: "读取失败",
        contextWindow: "DSH 上下文",
        reasoningEffort: "MiniMax 推理等级",
        followDsh: "跟随 DSH",
        defaultEffort: "default（原生默认）",
        higherUsage: "用量较高",
        allDefaultContext: "全部 512K",
        allMaxContext: "全部 1M",
        resetReasoning: "全部跟随 DSH",
        settingsUnavailable: "插件配置暂不可写；登录状态仍可正常使用。",
        saving: "保存中…",
        saveFailed: "保存失败"
      } : {
        title: "MiniMax Code",
        subtitle: "Uses the existing MiniMax Code sign-in on this machine through a loopback reverse proxy; DSH never stores an API key.",
        loading: "Reading the local MiniMax Code sign-in…",
        refresh: "Reload",
        refreshing: "Reading…",
        connected: "Local sign-in connected",
        expired: "Local sign-in expired",
        missing: "Local sign-in not found",
        mismatch: "Sign-in files are out of sync",
        disabled: "Plugin disabled",
        account: "Account",
        session: "Local session",
        expires: "Credential expiry",
        authFile: "Sign-in file",
        provider: "DSH route",
        upstream: "Proxy target",
        models: "Models",
        connectedHint: "DSH uses the local credential and refreshes once only when it is near expiry or the upstream returns 401.",
        stopHint: "The plugin does not sign out MiniMax Code or delete credentials. If the session is invalid, sign in again in MiniMax Code.",
        disabledHint: "The plugin is off. Turn it on to register the provider in the DSH model picker.",
        accountUnavailable: "Account details are temporarily unavailable, but the local credential is still used.",
        loadFailed: "Load failed",
        contextWindow: "DSH context",
        reasoningEffort: "MiniMax effort",
        followDsh: "Follow DSH",
        defaultEffort: "default (native default)",
        higherUsage: "higher usage",
        allDefaultContext: "All 512K",
        allMaxContext: "All 1M",
        resetReasoning: "Follow DSH for all",
        settingsUnavailable: "Plugin settings are not writable right now; the local sign-in still works.",
        saving: "Saving…",
        saveFailed: "Save failed"
      };
      const [state, setState] = React.useState({ loading: true, data: undefined, error: "" });
      const [busy, setBusy] = React.useState(false);
      const [savingKey, setSavingKey] = React.useState("");
      const [saveError, setSaveError] = React.useState("");
      const settingsSnapshot = useSettingsSnapshot(props.settingsScope);
      const settingsValue = unwrapVolatileDeep(settingsSnapshot.value) ?? {};
      const savedContextBudgets = mapOf(settingsValue.contextBudgets);
      const savedReasoningEfforts = mapOf(settingsValue.reasoningEfforts);
      const settingsWritable = settingsSnapshot.writable === true;

      const load = React.useCallback(async () => {
        setBusy(true);
        setState((current) => ({ ...current, loading: true, error: "" }));
        try {
          const data = await request("/status");
          setState({ loading: false, data, error: "" });
        } catch (error) {
          setState({
            loading: false,
            data: undefined,
            error: error instanceof Error ? error.message : String(error)
          });
        } finally {
          setBusy(false);
        }
      }, []);

      React.useEffect(() => {
        void load();
      }, [load]);

      const saveSetting = React.useCallback(async (key, field, value) => {
        if (!props.settingsScope || !settingsWritable) return;
        setSavingKey(key);
        setSaveError("");
        try {
          const saved = await props.settingsScope.set(field, value);
          if (saved === false) throw new Error(copy.settingsUnavailable);
        } catch (error) {
          setSaveError(`${copy.saveFailed}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setSavingKey("");
        }
      }, [copy.saveFailed, copy.settingsUnavailable, props.settingsScope, settingsWritable]);

      const setContextBudget = (model, value) => {
        void saveSetting(
          `context:${model.id}`,
          "contextBudgets",
          { ...savedContextBudgets, [model.id]: value }
        );
      };

      const setReasoningEffort = (model, value) => {
        const next = { ...savedReasoningEfforts };
        if (value === "") delete next[model.id];
        else next[model.id] = value;
        void saveSetting(`effort:${model.id}`, "reasoningEfforts", next);
      };

      const setAllContext = (value) => {
        const next = { ...savedContextBudgets };
        for (const model of data?.models ?? []) {
          if (model.contextWindowOptions?.includes(value)) next[model.id] = value;
        }
        void saveSetting(`context:all:${value}`, "contextBudgets", next);
      };

      const resetAllReasoning = () => {
        void saveSetting("effort:all", "reasoningEfforts", {});
      };

      if (state.loading) return h("div", { className: "dcm-loading" }, copy.loading);
      if (state.error) {
        return h("div", { className: "dcm-section" },
          h("div", { className: "dcm-head" },
            h("div", null,
              h("h2", { className: "dcm-title" }, copy.title),
              h("p", { className: "dcm-subtitle" }, copy.subtitle)
            ),
            h("button", { type: "button", className: "dcm-refresh", onClick: load, disabled: busy }, copy.refresh)
          ),
          h("p", { className: "dcm-message error" }, `${copy.loadFailed}: ${state.error}`)
        );
      }

      const data = state.data;
      const login = data.login ?? {};
      const enabled = data.provider?.enabled !== false;
      const connected = enabled && login.connected === true;
      const statusText = !enabled
        ? copy.disabled
        : connected
          ? copy.connected
          : login.status === "expired"
            ? copy.expired
            : login.status === "missing"
              ? copy.missing
              : copy.mismatch;
      const statusClass = connected ? "on" : login.status === "expired" ? "warn" : "";
      const accountName = data.account?.displayName;
      const accountMasked = data.account?.maskedId;
      const session = accountMasked
        ? [accountName, accountMasked].filter(Boolean).join(" · ")
        : accountName ?? login.sessionFingerprint;
      const selectedContextOf = (model) => {
        const saved = savedContextBudgets[model.id];
        return model.contextWindowOptions?.includes(saved) ? saved : model.contextWindow;
      };
      const selectedEffortOf = (model) => {
        const saved = savedReasoningEfforts[model.id];
        return model.reasoningEffortOptions?.includes(saved) ? saved : "";
      };
      const hasContextChoice = (data.models ?? []).some((model) => (model.contextWindowOptions?.length ?? 0) > 1);

      return h("div", { className: "dcm-section" },
        h("div", { className: "dcm-head" },
          h("div", null,
            h("h2", { className: "dcm-title" }, copy.title),
            h("p", { className: "dcm-subtitle" }, copy.subtitle)
          ),
          h("button", { type: "button", className: "dcm-refresh", onClick: load, disabled: busy }, busy ? copy.refreshing : copy.refresh)
        ),
        h("section", { className: "dcm-panel" },
          h("div", { className: "dcm-statusline" },
            h("span", { className: `dcm-dot ${statusClass}` }),
            h("span", { className: "dcm-status" }, statusText)
          ),
          h("p", { className: "dcm-note" }, !enabled ? copy.disabledHint : copy.connectedHint),
          h("div", { className: "dcm-meta" },
            h("span", { className: "dcm-key" }, copy.session),
            h("span", { className: "dcm-value" }, session ?? "—"),
            h("span", { className: "dcm-key" }, copy.expires),
            h("span", { className: "dcm-value" }, formatExpiry(login.expiresAtMs, chinese)),
            h("span", { className: "dcm-key" }, copy.authFile),
            h("span", { className: "dcm-value" }, login.authPath ?? "—"),
            h("span", { className: "dcm-key" }, copy.provider),
            h("span", { className: "dcm-value" },
              data.provider?.id
                ? `${data.provider.id} · ${
                    data.provider.registered
                      ? chinese ? "已注册" : "registered"
                      : data.provider.registrationError
                        ? chinese ? "注册失败" : "registration failed"
                        : chinese ? "启动中" : "starting"
                  }`
                : "—"
            ),
            h("span", { className: "dcm-key" }, copy.upstream),
            h("span", { className: "dcm-value" }, data.provider?.upstream ?? "—")
          ),
          h("p", { className: "dcm-note" }, copy.stopHint),
          data.accountError ? h("p", { className: "dcm-message warn" }, copy.accountUnavailable) : null
        ),
        h("section", { className: "dcm-panel" },
          h("div", { className: "dcm-status" }, copy.models),
          h("div", { className: "dcm-models" },
            (data.models ?? []).map((model) => {
              const selectedContext = selectedContextOf(model);
              const selectedEffort = selectedEffortOf(model);
              const contextSaving = savingKey === `context:${model.id}` || savingKey.startsWith("context:all:");
              const effortSaving = savingKey === `effort:${model.id}` || savingKey === "effort:all";
              return h("div", { className: "dcm-model", key: model.id },
                h("div", { className: "dcm-model-head" },
                  h("span", { className: "dcm-model-name" }, model.name ?? model.id),
                  h("span", { className: "dcm-model-meta" },
                    model.reasoning ? h("span", { className: "dcm-chip" }, "thinking") : null,
                    model.inputModalities?.includes("image") ? h("span", { className: "dcm-chip" }, "image") : null,
                    h("span", { className: "dcm-chip" }, `${formatContext(selectedContext)} ${chinese ? "上下文" : "context"}`),
                    h("span", { className: "dcm-chip" }, `${formatContext(model.maxTokens)} output`)
                  )
                ),
                (model.contextWindowOptions?.length > 1 || model.reasoningEffortOptions?.length > 0)
                  ? h("div", { className: "dcm-controls" },
                      model.contextWindowOptions?.length > 1
                        ? h("div", { className: "dcm-control" },
                            h("span", { className: "dcm-control-label" }, copy.contextWindow),
                            h("div", { className: "dcm-choices" },
                              model.contextWindowOptions.map((value) => h("button", {
                                type: "button",
                                className: "dcm-choice",
                                "data-active": String(value === selectedContext),
                                disabled: !settingsWritable || contextSaving,
                                title: value === 1_000_000 ? copy.higherUsage : undefined,
                                onClick: () => setContextBudget(model, value)
                              },
                                formatContext(value),
                                value === 1_000_000 ? h("span", { className: "dcm-save-note" }, copy.higherUsage) : null
                              ))
                            )
                          )
                        : null,
                      model.reasoningEffortOptions?.length > 0
                        ? h("label", { className: "dcm-control" },
                            h("span", { className: "dcm-control-label" }, copy.reasoningEffort),
                            h("select", {
                              className: "dcm-select",
                              value: selectedEffort,
                              disabled: !settingsWritable || effortSaving,
                              onChange: (event) => setReasoningEffort(model, event.target.value)
                            },
                              h("option", { value: "" }, copy.followDsh),
                              model.reasoningEffortOptions.map((effort) => h("option", {
                                key: effort,
                                value: effort
                              }, effort === "default" ? copy.defaultEffort : effort))
                            )
                          )
                        : null
                    )
                  : null
              );
            })
          ),
          hasContextChoice
            ? h("div", { className: "dcm-bulk" },
                h("button", {
                  type: "button",
                  className: "dcm-secondary",
                  disabled: !settingsWritable || savingKey.startsWith("context:"),
                  onClick: () => setAllContext(512_000)
                }, copy.allDefaultContext),
                h("button", {
                  type: "button",
                  className: "dcm-secondary",
                  disabled: !settingsWritable || savingKey.startsWith("context:"),
                  onClick: () => setAllContext(1_000_000)
                }, copy.allMaxContext),
                h("button", {
                  type: "button",
                  className: "dcm-secondary",
                  disabled: !settingsWritable || savingKey.startsWith("effort:"),
                  onClick: resetAllReasoning
                }, copy.resetReasoning)
              )
            : null,
          savingKey ? h("p", { className: "dcm-save-note" }, copy.saving) : null,
          saveError ? h("p", { className: "dcm-message error" }, saveError) : null,
          !settingsWritable ? h("p", { className: "dcm-message warn" }, copy.settingsUnavailable) : null
        )
      );
    }

    function formatExpiry(value, chinese) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "—";
      return new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    }

    function formatContext(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "?";
      if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
      return `${Math.round(value / 1000)}K`;
    }

    function apply(ctx) {
      try {
        ensureStyles();
        settingsScope = createSettingsScope(ctx);
        const SettingsView = (slotProps) => h(MiniMaxSettings, {
          ...(slotProps ?? {}),
          settingsScope
        });
        ctx.slots.inject("settings.section", () => {
          ctx.slots.register({
            name: "settings.section",
            id: "minimax",
            order: 440,
            label: "MiniMax Code"
          }, SettingsView);
        });
        ctx.slots.inject("plugins.bundle.config", () => {
          ctx.slots.register({
            name: "plugins.bundle.config",
            key: "dsh-connect-minimax",
            priority: 30
          }, SettingsView);
        });
        ctx.slots.inject("plugins.row.config", () => {
          ctx.slots.register({
            name: "plugins.row.config",
            key: "dsh-connect-minimax#dsh-connect-minimax",
            priority: 30
          }, SettingsView);
        });
      } catch (error) {
        console.error("[dsh-connect-minimax] settings UI failed to load:", error);
      }
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    exports.name = "dsh-connect-minimax-client";
    return module.exports;
  }
});
