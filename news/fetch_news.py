#!/usr/bin/env python3
"""抓取多个新闻源 RSS/Atom，输出原始 JSON + 自包含 HTML 头条板。

用法：
    python3 news/fetch_news.py            # 输出 news/<date>-raw.json 和 news/<date>-board.html
    python3 news/fetch_news.py 2026-10-11 # 指定日期标签

只依赖标准库。中文摘要由 agent 手写在 news/<date>-digest.md 里。
"""

from __future__ import annotations

import datetime as dt
import html
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

ATOM = "{http://www.w3.org/2005/Atom}"

FEEDS: dict[str, tuple[str, str, str]] = {
    # 名称: (URL, 类型, 分类)
    "BBC World": ("https://feeds.bbci.co.uk/news/world/rss.xml", "rss", "国际"),
    "Al Jazeera": ("https://www.aljazeera.com/xml/rss/all.xml", "rss", "国际"),
    "The Guardian": ("https://www.theguardian.com/world/rss", "rss", "国际"),
    "The Verge": ("https://www.theverge.com/rss/index.xml", "atom", "科技"),
    "Ars Technica": ("https://feeds.arstechnica.com/arstechnica/index", "rss", "科技"),
    "TechCrunch": ("https://techcrunch.com/feed/", "rss", "科技"),
    "CNBC Tech": (
        "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910",
        "rss",
        "科技",
    ),
    "Hacker News": ("https://hnrss.org/frontpage", "rss", "开发者"),
}

PER_FEED = 8
UA = {"User-Agent": "Mozilla/5.0 (compatible; cline-news-digest/1.0)"}


def strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or ""))).strip()


def parse(raw: bytes, kind: str) -> list[dict[str, str]]:
    root = ET.fromstring(raw)
    nodes = root.iter("item") if kind == "rss" else root.iter(f"{ATOM}entry")
    items: list[dict[str, str]] = []
    for node in nodes:
        if kind == "rss":
            get = lambda tag: (node.findtext(tag) or "").strip()  # noqa: E731
            title, link = get("title"), get("link")
            date, desc = get("pubDate"), get("description")
        else:
            title = (node.findtext(f"{ATOM}title") or "").strip()
            link_el = node.find(f"{ATOM}link")
            link = (link_el.get("href") if link_el is not None else "") or ""
            date = (
                node.findtext(f"{ATOM}updated") or node.findtext(f"{ATOM}published") or ""
            ).strip()
            desc = node.findtext(f"{ATOM}summary") or ""
        items.append(
            {
                "title": html.unescape(title),
                "link": link.strip(),
                "date": date.strip(),
                "summary": strip_tags(desc)[:320],
            }
        )
    return items[:PER_FEED]


def fetch_all() -> dict[str, dict[str, object]]:
    out: dict[str, dict[str, object]] = {}
    for name, (url, kind, category) in FEEDS.items():
        try:
            req = urllib.request.Request(url, headers=UA)
            raw = urllib.request.urlopen(req, timeout=20).read()
            items = parse(raw, kind)
            out[name] = {"category": category, "url": url, "items": items}
            print(f"  {name}: {len(items)} items")
        except Exception as exc:  # 单个源失败不影响整体
            out[name] = {"category": category, "url": url, "items": [], "error": str(exc)}
            print(f"  {name}: ERROR {exc}", file=sys.stderr)
    return out



def render_board(date: str, data: dict[str, dict[str, object]]) -> str:
    groups: dict[str, list[tuple[str, dict[str, object]]]] = {}
    for name, feed in data.items():
        groups.setdefault(str(feed["category"]), []).append((name, feed))

    sections = []
    for category, feeds in groups.items():
        blocks = []
        for name, feed in feeds:
            items = feed["items"]
            if not items:
                continue
            lis = "\n".join(
                f'<li><a href="{html.escape(str(i["link"]))}" target="_blank" rel="noopener">'
                f'{html.escape(str(i["title"]))}</a>'
                f'<span class="src">{html.escape(name)}</span></li>'
                for i in items
            )
            blocks.append(f"<h3>{html.escape(name)}</h3>\n<ul>{lis}</ul>")
        sections.append(
            f"<section><h2>{html.escape(category)}</h2>\n" + "\n".join(blocks) + "</section>"
        )

    return f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>新闻头条板 · {date}</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ font: 15px/1.6 -apple-system, "Segoe UI", "PingFang SC", sans-serif;
         max-width: 860px; margin: 40px auto; padding: 0 20px;
         background: #0e1116; color: #e6edf3; }}
  h1 {{ font-size: 24px; margin: 0 0 4px; }}
  .sub {{ color: #8b949e; font-size: 13px; margin-bottom: 28px; }}
  h2 {{ font-size: 15px; letter-spacing: .12em; text-transform: uppercase;
        color: #58a6ff; margin: 34px 0 10px; padding-bottom: 6px;
        border-bottom: 1px solid #21262d; }}
  h3 {{ font-size: 13px; color: #8b949e; font-weight: 600; margin: 18px 0 6px; }}
  ul {{ list-style: none; padding: 0; margin: 0; }}
  li {{ padding: 7px 0; border-bottom: 1px solid #161b22; }}
  a {{ color: #e6edf3; text-decoration: none; }}
  a:hover {{ color: #58a6ff; }}
  .src {{ color: #484f58; font-size: 11px; margin-left: 8px; }}
</style></head>
<body>
<h1>📰 新闻头条板</h1>
<div class="sub">{date} · 由 <code>news/fetch_news.py</code> 自动抓取生成
（{len(data)} 个源，每个源最多 {PER_FEED} 条）</div>
{"".join(sections)}
</body></html>
"""


def main() -> None:
    date = sys.argv[1] if len(sys.argv) > 1 else dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    root = pathlib.Path(__file__).resolve().parent

    print(f"抓取 {len(FEEDS)} 个源…")
    data = fetch_all()

    raw_path = root / f"{date}-raw.json"
    raw_path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    board_path = root / f"{date}-board.html"
    board_path.write_text(render_board(date, data), encoding="utf-8")

    total = sum(len(f["items"]) for f in data.values())
    print(f"\n✅ {total} 条头条 → {raw_path.relative_to(root.parent)}")
    print(f"✅ 头条板     → {board_path.relative_to(root.parent)}")


if __name__ == "__main__":
    main()
