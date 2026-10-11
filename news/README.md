# 每日新闻摘要

由 Cline Cloud Agent 抓取、整理。目录结构：

```
news/
├── fetch_news.py            # 抓取脚本（纯标准库，可直接重跑）
├── raw/<date>.json          # 原始抓取数据（8 个源 × 8 条）
├── <date>-board.html        # 自动生成的"头条板"，浏览器打开即看
└── <date>-digest.md         # 中文摘要（按主题分类，含来源链接）
```

## 自己重跑

```bash
python3 news/fetch_news.py              # 用今天的日期
python3 news/fetch_news.py 2026-10-11   # 指定日期标签
```

`fetch_news.py` 会重新抓取所有源，覆盖 `raw/<date>.json` 并重新生成头条板。
单个源失败不影响整体（会记进 JSON 的 `error` 字段）。

## 新闻源

| 分类 | 源 |
|---|---|
| 国际 | BBC World、Al Jazeera、The Guardian |
| 科技 | The Verge（Atom）、Ars Technica、TechCrunch、CNBC Tech |
| 开发者 | Hacker News 首页 |

想加/换源，改 `fetch_news.py` 顶部的 `FEEDS` 字典即可（名称 → URL、格式、分类）。

## 已有摘要

- [2026-10-11](./2026-10-11-digest.md) ｜ [头条板](./2026-10-11-board.html)

> 说明：`<date>-digest.md` 的中文归纳由 agent 阅读抓取结果后手写，
> `board.html` 和 `raw/*.json` 是完全自动生成的。
