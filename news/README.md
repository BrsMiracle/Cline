# Daily Report · 每日新闻摘要

分支：**`DailyReport`** ｜ 由 Cline Cloud Agent 抓取、整理。

## 命名规则

所有**当日产物**的文件名都以 `YYYY-MM-DD` 日期开头：

```
news/
├── fetch_news.py                  # 抓取脚本（纯标准库，可直接重跑）
├── README.md                      # 本说明
├── 2026-10-11-raw.json            # ① 原始抓取数据（8 个源 × 8 条）
├── 2026-10-11-board.html          # ② 自动生成的"头条板"，浏览器打开即看
└── 2026-10-11-digest.md           # ③ 中文摘要（按主题分类，含来源链接）
```

| 文件名模式 | 生成方式 | 说明 |
|---|---|---|
| `<date>-raw.json` | 自动 | 原始数据，单个源失败会记进 `error` 字段 |
| `<date>-board.html` | 自动 | 自包含样式，无需联网即可打开 |
| `<date>-digest.md` | agent 手写 | 阅读抓取结果后的中文归纳 |

每天新增一组三个文件；`fetch_news.py` 和 `README.md` 不带日期（它们是工具，不是当日产物）。

## 自己重跑

```bash
python3 news/fetch_news.py              # 用今天（UTC）的日期
python3 news/fetch_news.py 2026-10-12   # 指定日期标签
```

会重新抓取所有源，写出 `<date>-raw.json` 并重新生成 `<date>-board.html`。单个源失败不影响整体。

## 新闻源

| 分类 | 源 |
|---|---|
| 国际 | BBC World、Al Jazeera、The Guardian |
| 科技 | The Verge（Atom）、Ars Technica、TechCrunch、CNBC Tech |
| 开发者 | Hacker News 首页 |

想加/换源，改 `fetch_news.py` 顶部的 `FEEDS` 字典即可（名称 → URL、格式、分类）。

## 已有日报

| 日期 | 摘要 | 头条板 | 原始数据 |
|---|---|---|---|
| 2026-10-11 | [digest](./2026-10-11-digest.md) | [board](./2026-10-11-board.html) | [raw](./2026-10-11-raw.json) |
