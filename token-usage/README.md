# Token Usage · 会话用量归档

分支：**`token-usage`** ｜ 记录每个 Cline 会话的 token 消耗、缓存命中率、成本与延迟。

## ⚠️ 为什么需要手动归档

每个 Cline 云会话跑在**自己的独立沙箱**里，用量数据只存在于该沙箱的 hub 事件库里：

```
~/.cline/data/db/hub-events-<hubId>.db      ← 唯一数据源
```

**沙箱销毁 = 数据消失。** 所以：

- ✅ 会话进行中或刚结束时，可以生成报告并推到本分支长期保存；
- ❌ 已结束的历史会话**无法回溯**（沙箱没了，库里也没有别的 session）。

实测佐证（在 2026-10-11 那个会话的沙箱里查的）：
`sessions.db` 只有 1 行、`hub_events` 只有 1 个 `session_id`、全盘只有 1 个 `hub-events-*.db`。

## 怎么用

### 在任意会话里（推荐）

把这句话丢给该会话的 agent：

> 运行 `python3 token-usage/session_stats.py --write`，
> 然后把 `token-usage/` 下的新文件提交并推送到 `token-usage` 分支。

（如果该会话的仓库里还没有这个脚本，先 `git fetch origin token-usage` 并 checkout 出来。）

### 手动

```bash
python3 token-usage/session_stats.py            # 只打印摘要
python3 token-usage/session_stats.py --write    # 写出 md + json

# 自定义单价（默认按 DeepSeek V4.1 Flash）
python3 token-usage/session_stats.py --write --price-in 3 --price-out 15 --price-cache 0.3
```

脚本只依赖标准库，会自动在 `$CLINE_HOME`、`~/.cline`、`/workspace/.cline-home`
里找最大的那个 `hub-events-*.db`，也可以用 `--db` 指定。

## 产物

每个会话两个文件，命名 `<日期>-<sessionId>.{md,json}`：

| 文件 | 内容 |
|---|---|
| `*.md` | 人类可读报告（GitHub 直接渲染，含表格） |
| `*.json` | 机器可读数据（totals / 成本 / 延迟 / 按 run 拆分） |

## 报告包含什么

- **会话参数**：会话 ID / 标题 / 模型 / provider / 来源 / 模式（act・plan）/ 思考开关与
  `reasoningEffort` / interactive / autoApproveTools / 能力开关（tools・spawn・teams）/ 工作区 /
  代码库与分支 / 是否子代理 / 会话状态 / `conversation_id` / team / 开始与结束时间 / 时长 /
  系统提示长度 + sha256 指纹 / 沙箱 hostname + pid
- **价格口径**：输入・输出・缓存读写单价、**价格来源**、价格抓取时间，
  以及「运行时计数器成本」与「按单价计算成本」两个口径并列
- **对话轮次**：每条用户消息 → 对应 run 的时间、调用次数、输入/输出 token、成本、墙钟时间；
  附原始 prompt 记录（id / 投递方式 / 附件数 / 文本）
- **总量**：调用次数、输入/输出/reasoning token、缓存读写、总 token
- **缓存命中率**：`cacheRead / inputTokens`
- **成本结构**：未缓存输入 / 缓存读取 / 输出 各自金额与占比，以及成本对比（"若全部不命中缓存会花多少"）
- **延迟与吞吐**：TTFT（首个 token / 首个正文 token）、流式时长、整迭代耗时、TPS
- **按 run 拆分**：每条用户消息触发的执行，各自的调用数、token、命中率、成本、墙钟时间

## 口径与局限

- token 与成本来自 `usage.updated` 事件（含 `reasoningTokenCount`）。
- **TTFT / TPS 是反推值**：由 `reasoning.delta` / `assistant.delta` 的事件时间戳计算，
  不是服务端上报；时间戳是 SDK **发出事件**的时刻，有缓冲/背压时会偏差。
- TPS 分母 =「首个 delta → usage 事件」，只统计流式 ≥0.5s 的样本（否则分片挤在同一毫秒会算出上万 tok/s 的假峰值）。
- 成本是**运行时计数器**，不一定是真实账单（`cline-cloud/*` 不在 SDK 的 included 归零白名单里，可能是市场价估算）。
  真实扣费看 **app.cline.bot → Settings → View Usage**。
- 少数调用不带回成本信息（`totalCost = 0`），所以计数器累计值会略低于按单价推算值。

## 历史会话 / 账号级数据

本分支只能记录"跑脚本时还活着的会话"。历史消耗请查：

- **app.cline.bot → Settings → View Usage**（账号级聚合，官方口径）
- Cline dashboard 的用量页

如果你能把那里的数字（按天/按模型）导出或截图给我，我可以整理成同样格式的 markdown 归档到本分支。

## 已有报告

| 日期 | 会话 | 模型 | 调用 | 输入 token | 缓存命中 | 成本 | 报告 |
|---|---|---|---:|---:|---:|---:|---|
| 2026-10-11 | `tsk-01M4MEXH9ZTT3T8NT7JMX35YKH` | cline-cloud/deepseek-v4.1-flash | 149 | 19,709,616 | 96.61% | $0.4390 | [md](./2026-10-11-tsk-01M4MEXH9ZTT3T8NT7JMX35YKH.md) ｜ [json](./2026-10-11-tsk-01M4MEXH9ZTT3T8NT7JMX35YKH.json) |

<sub>新增报告时请顺手在表里加一行。</sub>
