# 单词本：LLM 浏览器直连与设备级配置

单词本让用户接入自己的 LLM 查词生成词卡。有两个决策直接影响架构与安全边界：调用从哪发出、API Key 存在哪。另有一条因本功能踩到性能预算红线而定下的客户端导入约束，一并记录。

## 1. LLM 调用从哪发

| 路线 | 代价 |
|---|---|
| 服务器代理（新增 `POST /api/v1/vocab/lookup`，Key 存服务器） | **双份实现**：本地模式（`#/local`，设计见 P3）没有后端，这条路上仍得在浏览器直连 —— 同一段调用 / 重试 / 契约校验要维护两套；且把个人 API Key 放进线上数据库与服务器配置，泄漏面扩大 |
| **浏览器直连（OpenAI 兼容 `POST {baseUrl}/chat/completions`）** | 两条数据模式共用一份实现（`client/src/utils/vocabLlm.ts`）；代价是受服务商 CORS 政策约束 |

决定：**统一浏览器直连**，原生 `fetch` + 30 秒超时 + 契约校验失败自动重试 1 次，零新依赖。服务器不提供任何 LLM 端点，`vocab_cards` 只存生成结果。

CORS 被拒**不做代码级降级**，只做文案降级：归为 `LlmError('cors')`，提示「该服务商可能不允许浏览器直连（CORS），或地址/网络有误」；后路 = 未来加服务器代理（本期不做，见 spec §10）。因为 `lookupWord` 是唯一调用点，届时替换面收敛在一处；真要上代理需另开 ADR（Key 归属与存储位置都要重新定调）。

## 2. LLM 配置存哪

| 路线 | 问题 |
|---|---|
| 服务器 `user_settings` 云存（同 `pomodoroSoundEnabled`） | API Key 进服务器数据库，且随备份体系流转，**泄漏面最大**；而「接哪家 LLM、哪个模型」是设备级选择（不同网络的 CORS 可达性、本机代理设置都不同），跨设备同步并非用户预期 |
| **localStorage 设备级 `kaoyandaily-vocab-llm-config`** | 无网络往返、与主题 / 节能模式的既有设备级语义一致；代价是换浏览器 / 清缓存后需重填 |

决定：**localStorage 设备级**。三字段 `baseUrl` / `apiKey` / `model` **均非空才算「已配置」**（`loadLlmConfig()` 否则返回 `null`，UI 引导打开配置面板）；**不进备份、不上传服务器**（备份 schema 里没有该字段，含 `apiKey` 导出即泄漏）；服务器模式与本地模式共用同一份设备级配置。

## 3. 附：客户端禁止值导入 `@shared/schemas/*`

`shared/src/schemas/vocab.ts` 顶层构造 Zod schema；客户端**值导入**会把 zod 运行时拖进前端产物，而 `e2e/check-perf-budget.mjs` 断言全部 `assets/*.js` 不含 `"invalid_type"`（首屏 JS ≤ 200KB 的配套红线）。

- 客户端只允许值导入 zod-free 模块：`@shared/srs`（纯函数，双端同源）、`@shared/constants`；类型一律 `import type`。
- `normalizeWord` 的 **zod-free 等价实现收在 `client/src/local/types.ts`**（全客户端唯一一份），语义与 shared 版逐字一致（trim + lowercase）。
- `vocabLlm.ts` 的响应契约校验为手写等价实现，逐条对齐 `VocabContentSchema`（长度上限、未知键丢弃），不引 zod。

## Consequences

- 查词在服务器模式与本地模式行为完全一致；CORS 被拒时该服务商不可用，用户需换服务商或自备代理网关 —— 文案已明示，不是缺陷。
- API Key 只存在于用户浏览器 localStorage；备份文件与服务器数据库都不含 Key（ADR 0007 的「设备级偏好」先例同样适用于此）。
- 客户端新增 shared 依赖前先跑 `node e2e/check-perf-budget.mjs`：值导入 `@shared/schemas/*` 会在「无效 `invalid_type` 泄漏」断言处失败，属预期拦截而非误报。
- 未配置时「查询单词」引导打开配置面板；配置面板是纯设备级表单，不随账户切换而变。
