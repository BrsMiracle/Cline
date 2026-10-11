# 当前模型 & “clinefree” 是不是免费

调查时间：2026-10-11（本沙箱会话）

## 1. 这个会话实际用的是哪个模型

会话元数据（由平台写入，最权威）：

- 文件：`.cline-home/data/sessions/tsk-01M4MEXH9ZTT3T8NT7JMX35YKH/tsk-01M4MEXH9ZTT3T8NT7JMX35YKH.json`
  - `"provider": "cline"`
  - `"model": "cline-cloud/deepseek-v4.1-flash"`
  - `"source": "dashboard"`（即 Cline Cloud Agents / 网页端云代理会话）
- 交叉验证：`.cline-home/data/db/sessions.db` 的 `sessions` 表同一行也是
  `provider = cline`, `model = cline-cloud/deepseek-v4.1-flash`。

结论：**DeepSeek V4.1 Flash（通过 Cline 提供，`cline-cloud/` 命名空间）**，不是
`cline-free/*` 那一类免费模型。注意：模型无法自省自己的权重，以上是平台配置里记录的
模型 id。

## 2. `cline-free/*` 是什么

Cline 官方推荐的模型目录接口（`GET /api/v1/ai/cline/recommended-models`，本次实测返回）
分成几个桶：

- `recommended`：如 `anthropic/claude-sonnet-5.5`、`openai/gpt-6.1-sol`、`moonshotai/kimi-k3`
- `free`（即 `cline-free/*`，真正的免费促销位，本次实测为 4 个）：
  - `cline-free/step-5-preview`
  - `cline-free/mimo-v2.6-flash`
  - `cline-free/muse-spark-1.3-contributor`
  - `cline-free/solar-mini4`
- `clinePass`（`cline-pass/*`，$9.99/月订阅位）：含 `cline-pass/deepseek-v4.1-flash` 等
- `clineCloud`（`cline-cloud/*`，仅云会话可用，本次实测只有 1 个）：
  - `cline-cloud/deepseek-v4.1-flash`  ← 本会话使用的模型

代码依据（cline/cline）：
- `sdk/packages/llms/src/catalog/catalog-cline-recommended.ts`：`free` 与 `clineCloud`
  是不同字段；`clineCloud` 仅在 `includeClineCloudModels` 时加载（“models that are only
  valid for Cline Cloud sessions”）。
- `apps/cli/src/utils/free-model-cost.ts`：`shouldZeroClineFreeModelCost()` 只对
  `free` 桶里的 id 归零成本（`cline-free/*`），本会话模型不在其中。

## 3. 那它免费吗？

- 官方文档《Cline Free Models》：免费模型是**限时轮换的促销**，额度有限；只对 Cline
  账号、且**只在 CLI / IDE 扩展（以及 Cloud Agents 的 ClineFree 选项）里可用**，官方
  明确说 **free 模型不支持 Cline API**。额度用完后可选 ClinePass（$9.99/月）或
  Cline usage-billing 按量付费。
- 文档《Cline Cloud Agents》：云会话支持三种 provider —— **ClineFree（免费额度）**、
  ClinePass（订阅）、Cline（按量付费 credits）。
- 新闻（rss.bz，约 6 天前）：Cline 因“abnormally high abuse”**暂停了
  DeepSeek-V4.1-Flash 的免费促销**，并称正在调查和缓解。
- 第三方页面 aile.sh 把 Cline 的 `deepseek/deepseek-v4.1-flash` 标为
  输入 $0.0001 / 输出 $0.600 每百万 token（近乎免费输入，但非 0）。

因此：**不能断言当前这个会话是免费的**。它属于 `cline-cloud/*`（云代理模型），而不是
当前 `free` 桶里的 4 个 `cline-free/*` 模型；且 DeepSeek-V4.1-Flash 的免费促销已被官方
暂停。是否计费取决于你账号的方案/额度，请以 **Cline 设置 → View Usage** 为准。

## 4. 想确认/切换到免费模型

- Cloud Agents：新建任务时在模型选择器里选 **ClineFree**（或标了 FREE 的模型）。
- CLI / IDE：`/settings` → provider 选 `Cline`，挑带 FREE 标记的模型。
- 免费额度用尽后：ClinePass 或 Cline credits，或自带 API key（BYOK）。
