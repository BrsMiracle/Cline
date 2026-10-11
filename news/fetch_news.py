#!/usr/bin/env python3
"""抓取多个新闻源 RSS/Atom，输出原始 JSON + 自包含 HTML 头条板。

用法：
    python3 news/fetch_news.py            # 输出 news/<date>-raw.json 和 news/<date>-board.html
    python3 news/fetch_news.py 2026-10-11 # 指定日期标签

只依赖标准库。中文摘要由 agent 手写在 news/<date>-digest.md 里。
"""

from __future__ import annotations

import datetime as dt
from concurrent import futures
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
MEDIA_NS = "{http://search.yahoo.com/mrss/}"



def strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or ""))).strip()


def pick_image(node: ET.Element) -> str:
    """从 RSS/Atom 节点里挑一张最大尺寸的配图，挑不到返回空串。"""
    best_url, best_width = "", -1
    for child in node.iter():
        tag = child.tag
        if tag in (f"{MEDIA_NS}content", f"{MEDIA_NS}thumbnail"):
            url = (child.get("url") or "").strip()
            if not url:
                continue
            kind = (child.get("type") or "").lower()
            medium = (child.get("medium") or "").lower()
            if medium and medium != "image":
                continue
            if kind and not kind.startswith("image"):
                continue
            raw_w = child.get("width") or "0"
            width = int(raw_w) if raw_w.isdigit() else 0
            if width > best_width:
                best_url, best_width = url, width
        elif tag == "enclosure":
            url = (child.get("url") or "").strip()
            kind = (child.get("type") or "").lower()
            if url and (
                kind.startswith("image") or re.search(r"\.(jpe?g|png|webp|gif)$", url, re.I)
            ):
                if best_width < 0:
                    best_url, best_width = url, 0
    return best_url


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
                "image": pick_image(node),
            }
        )
    return items[:PER_FEED]


def fetch_og_image(url: str) -> str:
    """抓文章页的 og:image（给 RSS 里没配图的源兜底）。"""
    if not url:
        return ""
    try:
        req = urllib.request.Request(url, headers=UA)
        page = urllib.request.urlopen(req, timeout=10).read(400_000).decode("utf-8", "replace")
    except Exception:
        return ""
    patterns = (
        r'<meta[^>]+property="og:image"[^>]+content="([^"]+)',
        r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"',
        r'<meta[^>]+name="twitter:image"[^>]+content="([^"]+)',
    )
    for pattern in patterns:
        match = re.search(pattern, page, re.I)
        if match:
            return html.unescape(match.group(1)).strip()
    return ""


def fetch_all(with_og: bool = False) -> dict[str, dict[str, object]]:
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

    if with_og:
        missing = [
            (name, item)
            for name, feed in out.items()
            for item in feed["items"]
            if not item.get("image")
        ]
        print(f"  补抓 og:image：{len(missing)} 条…")
        with futures.ThreadPoolExecutor(max_workers=6) as pool:
            found = list(pool.map(lambda pair: fetch_og_image(str(pair[1]["link"])), missing))
        for (_, item), image in zip(missing, found):
            if image:
                item["image"] = image
        print(f"  补到 {sum(1 for i in found if i)} 条")
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


def render_markdown(date: str, data: dict[str, dict[str, object]]) -> str:
    """生成 GitHub 原生可读的 Markdown 头条板（免下载，打开网页即看）。"""
    total = sum(len(f["items"]) for f in data.values())
    with_img = sum(1 for f in data.values() for i in f["items"] if i.get("image"))

    out: list[str] = [
        f"# \U0001f4f0 每日新闻头条板 · {date}",
        "",
        f'<img src="./assets/{date}-cover.svg" alt="cover">',
        "",
        f"> **{total} 条头条**，来自 {len(data)} 个源，其中 {with_img} 条带配图。",
        "> 本页由 GitHub 原生渲染，**点开即看，无需下载**；图片直连原站。",
        f"> 机器可读数据：[`{date}-raw.json`](./{date}-raw.json) ｜ 摘要：[`{date}-digest.md`](./{date}-digest.md)",
        "",
        "---",
        "",
        "## \U0001f5c2\ufe0f 速览",
        "",
    ]

    for name, feed in data.items():
        items = feed["items"]
        if not items:
            continue
        links = " · ".join(f'[{i["title"][:42]}]({i["link"]})' for i in items[:3])
        out.append(f"- **{name}** — {links}")

    emoji = {"国际": "\U0001f30d", "科技": "\U0001f4a1", "开发者": "\U0001f6e0\ufe0f"}
    groups: dict[str, list[tuple[str, dict[str, object]]]] = {}
    for name, feed in data.items():
        groups.setdefault(str(feed["category"]), []).append((name, feed))

    for category, feeds in groups.items():
        icon = emoji.get(category, "\U0001f4cc")
        out += ["", "---", "", f"## {icon} {category}", ""]
        for name, feed in feeds:
            items = feed["items"]
            if not items:
                continue
            out += [f"### {name}", "", "| 配图 | 头条 |", "|:--:|:--|"]
            for item in items:
                img = item.get("image") or ""
                cell = f'<img src="{img}" width="200" alt="">' if img else "·"
                meta = f'{name} · {item["date"][:16]}'
                body = f'**[{item["title"]}]({item["link"]})**<br><sub>{meta}</sub>'
                if item.get("summary"):
                    body += f'<br>{item["summary"][:180]}'
                out.append(f"| {cell} | {body} |")
            out.append("")

    out += [
        "---",
        "",
        "<sub>由 `news/fetch_news.py` 自动生成。重跑：`python3 news/fetch_news.py`"
        f"（当前标签 {date}）</sub>",
        "",
    ]
    return "\n".join(out)


def render_cover_svg(date: str, data: dict[str, dict[str, object]]) -> str:
    """生成一张自包含 SVG 封面（矢量、体积小、GitHub 直接渲染）。"""
    items = [i for f in data.values() for i in f["items"]]
    total = len(items)
    top = items[:3]
    names = " · ".join(list(data)[:5])

    def esc(value: object) -> str:
        return html.escape(str(value)[:62])

    bullet = "\u2022"
    rows = "".join(
        '<text x="64" y="%d" class="t">%s %s</text>' % (258 + n * 34, bullet, esc(i["title"]))
        for n, i in enumerate(top)
    )
    css = (
        "<style>"
        ".k{font:600 13px ui-monospace,Menlo,monospace;fill:#8b949e;letter-spacing:.28em}"
        ".d{font:700 78px -apple-system,Segoe UI,Helvetica,sans-serif;fill:#e6edf3}"
        ".n{font:600 20px -apple-system,Segoe UI,sans-serif;fill:#58a6ff}"
        ".t{font:400 17px -apple-system,Segoe UI,PingFang SC,sans-serif;fill:#c9d1d9}"
        ".s{font:400 13px ui-monospace,Menlo,monospace;fill:#6e7681}"
        "</style>"
    )
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" '
        'viewBox="0 0 1200 400" role="img" aria-label="Daily Report ' + esc(date) + '">',
        '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#0d1117"/><stop offset="55%" stop-color="#161b22"/>'
        '<stop offset="100%" stop-color="#1f2937"/></linearGradient>'
        '<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0%" stop-color="#58a6ff"/><stop offset="50%" stop-color="#a371f7"/>'
        '<stop offset="100%" stop-color="#f778ba"/></linearGradient>',
        css,
        "</defs>",
        '<rect width="1200" height="400" fill="url(#bg)"/>',
        '<rect width="1200" height="6" fill="url(#bar)"/>',
        '<circle cx="1080" cy="70" r="190" fill="#58a6ff" opacity="0.07"/>',
        '<circle cx="980" cy="330" r="150" fill="#a371f7" opacity="0.06"/>',
        '<text x="64" y="88" class="k">DAILY REPORT</text>',
        '<text x="64" y="172" class="d">' + esc(date) + "</text>",
        '<text x="64" y="212" class="n">' + str(total) + " headlines · "
        + str(len(data)) + " sources</text>",
        rows,
        '<text x="64" y="366" class="s">' + esc(names) + "</text>",
        "</svg>",
    ]
    return "\n".join(parts) + "\n"


def render_index(root: pathlib.Path) -> str:
    """扫描 news/ 下的日期文件夹，生成总索引 INDEX.md。"""
    days = sorted(
        (d.name for d in root.iterdir() if d.is_dir() and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d.name)),
        reverse=True,
    )
    rows = []
    for day in days:
        base = f"./{day}/{day}"
        rows.append(
            f"| {day} | [board]({base}-board.md) | [digest]({base}-digest.md) "
            f"| [html]({base}-board.html) | [raw]({base}-raw.json) |"
        )
    return "\n".join(
        [
            "# 📚 Daily Report 归档索引",
            "",
            f"共 {len(days)} 天。每天一个文件夹，文件名为 `YYYY-MM-DD-<类型>.<后缀>`。",
            "",
            "| 日期 | 可读版（推荐） | 中文摘要 | 花哨版 HTML | 原始数据 |",
            "|---|---|---|---|---|",
            *rows,
            "",
            "<sub>本文件由 `news/fetch_news.py` 自动生成。</sub>",
            "",
        ]
    )


def main() -> None:
    date = sys.argv[1] if len(sys.argv) > 1 else dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    root = pathlib.Path(__file__).resolve().parent
    day = root / date
    day.mkdir(parents=True, exist_ok=True)

    with_og = "--og" in sys.argv
    print(f"抓取 {len(FEEDS)} 个源…")
    data = fetch_all(with_og=with_og)

    raw_path = day / f"{date}-raw.json"
    raw_path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    board_path = day / f"{date}-board.html"
    board_path.write_text(render_board(date, data), encoding="utf-8")

    md_path = day / f"{date}-board.md"
    md_path.write_text(render_markdown(date, data), encoding="utf-8")

    assets = day / "assets"
    assets.mkdir(exist_ok=True)
    cover_path = assets / f"{date}-cover.svg"
    cover_path.write_text(render_cover_svg(date, data), encoding="utf-8")

    index_path = root / "INDEX.md"
    index_path.write_text(render_index(root), encoding="utf-8")

    total = sum(len(f["items"]) for f in data.values())
    print(f"\n✅ {total} 条头条 → {raw_path.relative_to(root.parent)}")
    print(f"✅ 头条板     → {board_path.relative_to(root.parent)}")
    print(f"✅ 可读版     → {md_path.relative_to(root.parent)}")
    print(f"✅ 封面       → {cover_path.relative_to(root.parent)}")
    print(f"✅ 归档索引   → {index_path.relative_to(root.parent)}")


if __name__ == "__main__":
    main()
