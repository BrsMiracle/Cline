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

## 4. 追问：`cline-cloud/deepseek-v4.1-flash` 免费吗？有限额吗？（实测）

### 4.1 初判：计数器按标准价累积成本（⚠️ 结论已被 4.3 修正）

hub 事件库 `.cline-home/data/db/hub-events-hub-487d82e7ae44.db` 的 `hub_events` 表里，
本会话有 29 条 `usage.updated` 事件，其中 26 条 `delta.totalCost > 0`：

- 累计：input 949,068 / output 7,915 / cacheRead 885,642 tokens → **$0.043477**
- 对 26 条非零事件做最小二乘拟合（实测 `inputTokens` 含 cacheRead）：

| 项 | 拟合值（$/Mtok） | 官方参考价 |
|---|---|---|
| 输入（input − cacheRead） | **0.3001** | $0.30 |
| 输出（output + reasoning） | **1.2001** | $1.20 |
| 缓存读取 | **0.0060** | $0.006 |

残差：平均相对误差 0.1%，最大 1.0%。**计费口径与 DeepSeek V4.1 Flash 标准价完全一致，
没有任何"免费归零"。**

代码佐证：`apps/cli/src/utils/free-model-cost.ts` 的 `shouldZeroClineFreeModelCost()`
只对 `free` 桶（`cline-free/*`）id 归零成本；本会话模型是 `cline-cloud/*`，不在其中。

价格来源：ClinePass 文档 "Reference pricing" 表（DeepSeek V4.1 Flash: Input $0.30 /
Output $1.20 / Cached Read $0.006 per 1M）；目录接口 `GET /api/v1/ai/cline/models` 里
`deepseek/deepseek-v4.1-flash` 的 pricing = 3e-7 / 1.2e-6 / 6e-9，完全吻合。

### 4.3 修正：上面的「硬证据」站不住，计数器 ≠ 账单

用户反馈"确实没扣 credit"。回头去读**本沙箱里真正在跑的代码**
（`/app/node_modules/@cline/llms/dist/providers.js` 里 minified 的 `normalizeUsage`）：

```js
totalCost = billedCost(响应里的 cost / upstream_inference_cost，非 0 时)
         ?? marketCost(响应里的 market_cost / gateway.marketCost)
         ?? 按 pricing 计算的估值;

// 显式规则：Cline 自家 "included" 模型强制归零
included = providerId === "cline-pass"
        || (providerId === "cline"
            && (modelId.startsWith("cline-pass/")
             || modelId.startsWith("cline-free/")
             || modelId.endsWith(":free")
             || (pricing.input===0 && pricing.output===0
                 && (pricing.cacheRead??0)===0 && (pricing.cacheWrite??0)===0)));
totalCost = included ? 0 : totalCost;
```

关键：**`cline-cloud/` 不在这份白名单里**（当前 main 分支的源码同样如此）。而且内置目录
（同目录 `providers.js`）把 `cline-pass/deepseek-v4.1-flash`、全部 `cline-free/*` 的
`pricing` 都写成 `{input:0,output:0,cacheRead:0,cacheWrite:0}`（= included），
**压根没有 `cline-cloud/*` 条目** —— 说明这是新命名空间，成本归零逻辑还没覆盖。

所以第 4.1 节那个 $0.043 更可能是**"市场价"估算/展示值**（恰好等于 DeepSeek 官方
$0.30/$1.20/$0.006），而不是真实扣款。3 条 0 成本事件也说明该字段来源不稳定。

**结论修正**：本地只能看到"运行时成本计数器"，它 **不是账单**；我上一轮把它当成扣费证据
是过度推断了。是否真的扣 credit，只有 app.cline.bot → Settings → View Usage 能回答
（沙箱里没有你的 Cline API token，`/proc/1/environ` 里只有 `CLINE_USER_ID`，没有可用凭据，
所以无法替你查询，也不应该去查）。

仍然成立的部分：
- `cline-cloud/deepseek-v4.1-flash` **不在** `cline-free/*` 免费促销桶里。
- 文档层面 Cloud Agents 的三个 provider 中，**ClineFree 才是免费通道**；"按量扣 credit"
  只是文档给出的可能路径，**不是我能证实的既成事实**。

### 4.4 限额
> 注：下表第 1 行按 4.3 节的修正理解——本地计数器不等于账单。

| 场景 | 限制 |
|---|---|
| `cline-cloud/deepseek-v4.1-flash`（本会话） | 不在免费促销桶；按文档属于 Cline(usage-billing)/ClinePass 通道，但**你实测没被扣费**——是否计入额度以 View Usage 为准 |
| ClinePass（`cline-pass/deepseek-v4.1-flash`） | $9.99/月，2-5x 标准 API 速率；用量按 **5 小时滚动窗口 / 周 / 月** 计量，官方未公布具体 token 数 |
| Cline usage-billing | 限额 = credits 余额 |
| Cloud Agents 平台 | 最多 **10 个并发会话**、每天最多新建 **50 个会话** |
| `cline-free/*` 免费位 | 有额度但不公布数字；**不支持 Cline API**，仅 CLI/IDE/ClineFree |

另外：Cline 已因 "abnormally high abuse" **暂停 DeepSeek-V4.1-Flash 的免费促销**
（约 6 天前，rss.bz 报道），所以现在也蹭不到该模型的免费额度。

## 5. 想确认/切换到免费模型

- Cloud Agents：新建任务时在模型选择器里选 **ClineFree**（或标了 FREE 的模型）。
- CLI / IDE：`/settings` → provider 选 `Cline`，挑带 FREE 标记的模型。
- 免费额度用尽后：ClinePass 或 Cline credits，或自带 API key（BYOK）。
