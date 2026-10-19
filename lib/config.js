import z from "@deepseek-ai/schemastery";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_MAX_OUTPUT_TOKENS
} from "./core.js";

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
    .description("单个回复的最大输出 token 数")
});
