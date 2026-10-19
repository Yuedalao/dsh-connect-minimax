import z from "@deepseek-ai/schemastery";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MINIMAX_REASONING_EFFORTS
} from "./core.js";

function asVolatile(schema) {
  return typeof schema.volatile === "function" ? schema.volatile() : schema;
}

export const Config = z.object({
  enabled: z.boolean()
    .default(true)
    .description("启用 MiniMax Code 本机登录接入"),
  dataDir: z.string()
    .default(DEFAULT_DATA_DIR)
    .description("MiniMax Code 数据目录，默认是 ~/.minimax"),
  region: z.string()
    .default("cn")
    .description("读取哪个区域的 MiniMax Code 登录记录"),
  maxOutputTokens: z.number()
    .step(1)
    .min(1)
    .default(DEFAULT_MAX_OUTPUT_TOKENS)
    .description("单个回复的最大输出 token 数"),
  contextBudgets: asVolatile(z.dict(z.number().step(1).min(1)).default({})
    .description("每个 MiniMax 模型选择的 DSH 上下文窗口；仅接受该模型原生的 512K 或 1M")),
  reasoningEfforts: asVolatile(z.dict(z.union(MINIMAX_REASONING_EFFORTS)).default({})
    .description("每个模型固定的 MiniMax 原生推理等级；未配置时跟随 DSH 会话档位"))
});
