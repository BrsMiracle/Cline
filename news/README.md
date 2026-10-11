# Daily Report · 每日新闻摘要

分支：**`DailyReport`** ｜ 由 Cline Cloud Agent 抓取、整理。

📚 **总索引：[`INDEX.md`](./INDEX.md)**（自动维护，每天一行）

## ❓ 我要不要下载文件才能看？

| 文件 | GitHub 网页上直接看？ | 需要下载吗 |
|---|---|---|
| `*-board.md`（可读版，带图） | ✅ **原生渲染**，图片、表格、链接都正常 | **不用下载** |
| `*-digest.md`（中文摘要） | ✅ **原生渲染** | **不用下载** |
| `assets/*-cover.svg`（封面） | ✅ SVG 渲染成图片 | 不用下载 |
| `*-raw.json` | ⚠️ 只显示源码（JSON 不是网页） | 想解析就下载 |
| `*-board.html`（花哨版） | ❌ GitHub **不渲染 HTML**，点开只有源码 | 要下载后用浏览器打开 |

**结论：想在浏览器里直接看，看 `.md` 就对了。**

想让 HTML 也能免下载直接看，有两条路（都还没做）：

1. **GitHub Pages** —— ⚠️ 本仓库是 **private**，Pages 对私有仓库需要付费计划（Pro/Team/Enterprise）。
2. **把仓库改成 public** —— 之后 `raw.githack.com`、`htmlpreview.github.io`、jsDelivr
   之类的免费服务就能直接渲染 HTML，也能开 Pages。

## 📁 归档结构（一天一个文件夹）

```
news/
├── fetch_news.py                       # 抓取脚本（纯标准库）
├── README.md                           # 本说明
├── INDEX.md                            # 总索引（自动生成）
└── 2026-10-11/                         # ← 一天一个文件夹
    ├── 2026-10-11-board.md             # ① 可读版头条板（GitHub 原生渲染，带图）★ 推荐
    ├── 2026-10-11-board.html           # ② 花哨版（需下载后用浏览器打开）
    ├── 2026-10-11-digest.md            # ③ 中文摘要（手写，带重点配图）
    ├── 2026-10-11-raw.json             # ④ 原始数据（含图片 URL，机器可读）
    └── assets/
        └── 2026-10-11-cover.svg        # 自动生成的封面（矢量图）
```

每天新增一个日期文件夹，`news/` 根目录永远只有脚本 + 说明 + 索引，不会乱。

## 自己重跑

```bash
python3 news/fetch_news.py                   # 用今天（UTC）的日期，仅用 RSS 自带配图
python3 news/fetch_news.py 2026-10-11 --og   # 额外抓文章页 og:image 补图（推荐，约 6 秒）
```

`--og` 会把 RSS 里没配图的源再抓一遍文章页取 `og:image`。
实测 64 条：24 条有 RSS 配图 → 开 `--og` 后 **62 条**有图。

## 新闻源

| 分类 | 源 | RSS 自带配图 |
|---|---|---|
| 国际 | BBC World | ✅ |
| 国际 | Al Jazeera | ❌（靠 `--og` 补） |
| 国际 | The Guardian | ✅ |
| 科技 | The Verge（Atom） | ❌ |
| 科技 | Ars Technica | ✅ |
| 科技 | TechCrunch | ❌ |
| 科技 | CNBC Tech | ❌ |
| 开发者 | Hacker News | ❌ |

改 `fetch_news.py` 顶部的 `FEEDS` 字典即可增删源（名称 → URL、格式、分类）。

> 说明：`board.md` / `board.html` / `raw.json` / `cover.svg` / `INDEX.md` 完全自动生成；
> `digest.md` 的中文归纳由 agent 阅读抓取结果后手写。
> 图片直连原站（GitHub 会做代理缓存），版权归各新闻机构所有。
