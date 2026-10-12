#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a single self-contained HTML travel guide (images inlined as base64).

Usage:  python3 tools/build.py
Reads:  content/*.json  +  images/manifest-*.json
Writes: singapore-malaysia-november-guide.html
"""
import base64
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "singapore-malaysia-november-guide.html")

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

CACHE = {}


def load(name):
    with open(os.path.join(ROOT, "content", name), encoding="utf-8") as fh:
        return json.load(fh)


def data_uri(path, width=760, quality=74):
    """Inline a local image as a compact base64 JPEG data URI."""
    key = (path, width, quality)
    if key in CACHE:
        return CACHE[key]
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        CACHE[key] = ""
        return ""
    with open(full, "rb") as fh:
        raw = fh.read()
    if Image is not None:
        try:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            if img.width > width:
                img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
            raw = buf.getvalue()
        except Exception:  # noqa: BLE001
            pass
    uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    CACHE[key] = uri
    return uri


def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def img_tag(slug, group, alt, cls="card-img", width=760, quality=74):
    uri = data_uri("images/%s/%s.jpg" % (group, slug), width, quality)
    if not uri:
        return '<div class="%s img-missing">图片暂缺</div>' % cls
    return '<img class="%s" src="%s" alt="%s" loading="lazy">' % (cls, uri, esc(alt))


def credits(manifests):
    rows = []
    for man in manifests:
        for rec in man["images"]:
            rows.append(rec)
    rows.sort(key=lambda r: (r.get("title") or "").lower())
    out = []
    for r in rows:
        author = r.get("author") or "见来源页"
        author = re.sub(r"\{\{[^}]*\}\}", "", author).strip(" ,;") or "见来源页"
        lic = r.get("license") or "见来源页"
        src = r.get("source") or ""
        link = '<a href="%s" target="_blank" rel="noopener">%s</a>' % (esc(src), esc(r.get("title", ""))) if src else esc(r.get("title", ""))
        out.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (link, esc(author), esc(lic), esc(r.get("caption", ""))))
    return "\n".join(out)


# --------------------------------------------------------------------------
# content loaders + renderers
# --------------------------------------------------------------------------
def load_ctrip(slug):
    """city slug -> {attraction name: row}, merging the list TSV with the detail TSV."""
    rows = {}
    for suffix in ("", "-detail"):
        path = os.path.join(ROOT, "research", "ctrip-%s%s.tsv" % (slug, suffix))
        if not os.path.exists(path):
            continue
        lines = [l.rstrip("\n").split("\t") for l in open(path, encoding="utf-8")]
        head = lines[0]
        for r in lines[1:]:
            if len(r) < len(head):
                r = r + [""] * (len(head) - len(r))
            rec = dict(zip(head, r))
            prev = rows.setdefault(rec["name"], {})
            for k, v in rec.items():
                if v and not prev.get(k):
                    prev[k] = v
    return rows


def fmt_int(v):
    try:
        return "{:,}".format(int(float(v)))
    except (TypeError, ValueError):
        return v or ""


def short_hours(text, limit=58):
    if not text:
        return ""
    t = re.split(r"[;；]", text)[0]
    t = re.sub(r"特殊营业时间：", "", t)
    if len(t) > limit:
        cut = max(t.rfind("、", 0, limit), t.rfind("，", 0, limit), t.rfind(",", 0, limit))
        t = t[:cut] if cut > limit * 0.5 else t[:limit - 1] + "…"
    return t


def render_cards(items, ctrip_rows, group):
    out = []
    for it in items:
        rec = ctrip_rows.get(it.get("ctrip") or "\u0000", {}) if it.get("ctrip") else {}
        name = it.get("name_override") or (it.get("ctrip") if rec else "") or it.get("en", "")
        parts = ['<div class="acard">']
        parts.append(img_tag(it["slug"], group, name, width=520, quality=70))
        parts.append('<div class="body">')
        parts.append("<h3>%s</h3>" % esc(name))
        parts.append('<div class="en">%s</div>' % esc(it.get("en", "")))
        parts.append('<p class="desc">%s</p>' % esc(it.get("desc", "")))
        kv = []
        if it.get("dur"):
            kv.append("<span>⏱ %s</span>" % esc(it["dur"]))
        if it.get("mrt"):
            kv.append("<span>🚇 %s</span>" % esc(it["mrt"]))
        hrs = short_hours(rec.get("hours", ""))
        if hrs:
            kv.append("<span>🕘 %s</span>" % esc(hrs))
        price = (rec.get("price_cny") or "").strip()
        if price:
            kv.append("<span>🎟 携程参考 ¥%s 起</span>" % esc(price))
        elif rec:
            kv.append("<span>🎟 免费</span>")
        if kv:
            parts.append('<div class="kv">%s</div>' % "".join(kv))
        if rec and rec.get("score"):
            parts.append('<div class="stars">★ %s / 5 · %s 条点评 <a class="src" href="%s" target="_blank" rel="noopener">携程</a></div>'
                         % (esc(rec["score"]), esc(fmt_int(rec.get("reviews"))),
                            esc((rec.get("detail") or "").split("?")[0])))
        if it.get("tip"):
            parts.append('<div class="tip">💡 %s</div>' % esc(it["tip"]))
        parts.append("</div></div>")
        out.append("".join(parts))
    return '<div class="grid g3">%s</div>' % "\n".join(out)


def render_rows(rows, cols, cls=""):
    head = "".join("<th>%s</th>" % c[1] for c in cols)
    body = []
    for r in rows:
        tds = []
        for key, _label, kind in cols:
            val = r.get(key, "")
            if kind == "price":
                tds.append('<td class="price">%s</td>' % esc(val))
            elif kind == "src" and val:
                tds.append('<td><a href="%s" target="_blank" rel="noopener">链接</a></td>' % esc(val))
            else:
                tds.append("<td>%s</td>" % esc(val))
        body.append("<tr>%s</tr>" % "".join(tds))
    return '<table class="%s"><thead><tr>%s</tr></thead><tbody>%s</tbody></table>' % (cls, head, "".join(body))


FLIGHT_COLS = [("route", "航线", ""), ("low", "最低单程价", "price"), ("plat", "来源平台", ""),
               ("type", "直飞/中转", ""), ("airline", "航司", ""), ("fno", "航班号", ""),
               ("times", "时刻 / 时长", ""), ("bag", "行李（手提 / 托运）", ""), ("alt", "其他渠道与备注", "")]


def render_flights(rows):
    return render_rows(rows, FLIGHT_COLS)


def render_calendars(cals):
    out = []
    for c in cals:
        vals = [float(x) for x in c["days"].values() if x not in ("—", "")]
        lo, hi = (min(vals), max(vals)) if vals else (0, 0)
        cells = []
        for d in range(1, 31):
            v = c["days"].get(str(d), "—")
            cls = ""
            if v not in ("—", ""):
                try:
                    n = float(v)
                    if n <= lo * 1.06:
                        cls = "low"
                    elif n >= hi * 0.9:
                        cls = "high"
                except ValueError:
                    cls = ""
            cells.append('<td class="num"><span class="badge %s">%s</span></td>' % (cls, esc(v)))
        h1 = "".join("<th class='num'>%d</th>" % d for d in range(1, 16))
        h2 = "".join("<th class='num'>%d</th>" % d for d in range(16, 31))
        out.append(
            '<h4 style="margin:20px 0 8px;font-size:15.5px">%s <span class="badge air">%s</span></h4>'
            '<div class="tw"><table><thead><tr><th>11月</th>%s</tr></thead><tbody><tr><td><b>%s</b></td>%s</tr></tbody></table></div>'
            '<div class="tw" style="margin-top:8px"><table><thead><tr><th>11月</th>%s</tr></thead><tbody><tr><td><b>%s</b></td>%s</tr></tbody></table></div>'
            '<div class="scroll-hint">来源：%s。绿色=该航线 11 月低价档，红色=高价档，「—」=页面当日未给出价格。</div>'
            % (esc(c["route"]), esc(c["cur"]), h1, esc(c["cur"]), "".join(cells[:15]),
               h2, esc(c["cur"]), "".join(cells[15:]), esc(c["src"])))
    return "\n".join(out)


def render_picks(picks):
    out = []
    for p in picks:
        rows = []
        for r in p["rows"]:
            rows.append("<tr><td><b>%s</b></td><td>%s</td><td>%s</td><td class='price'>%s</td><td>%s</td></tr>"
                        % (esc(r["leg"]), esc(r["route"]), esc(r["pick"]), esc(r["price"]), esc(r["note"])))
        out.append(
            '<div class="card pad" style="margin-bottom:16px">'
            '<h3 style="margin:0 0 4px;font-size:17px"><span class="tag %s">方案 %s</span> %s</h3>'
            '<p style="margin:0 0 10px;color:#7b8798;font-size:13.4px">%s</p>'
            '<div class="tw"><table><thead><tr><th>阶段</th><th>航线 / 路段</th><th>推荐航班或交通</th><th>参考价</th><th>备注</th></tr></thead>'
            "<tbody>%s</tbody></table></div></div>"
            % (p["tag"].lower(), esc(p["tag"]), esc(p["title"]), esc(p["total"]), "".join(rows)))
    return "\n".join(out)


def render_tips(tips):
    return "\n".join('<details open><summary>%s</summary><p>%s</p></details>' % (esc(t["t"]), esc(t["d"])) for t in tips)



def find_image(slug, prefer="malaysia"):
    """Return (group, slug) for the first group that actually has the file."""
    for grp in (prefer, "singapore", "malaysia"):
        if os.path.exists(os.path.join(ROOT, "images", grp, slug + ".jpg")):
            return grp
    return None


def render_food(items, group):
    out = []
    for it in items:
        slug = it.get("slug", "")
        grp = find_image(slug, "malaysia") if slug else None
        img = img_tag(slug, grp, it["name"], width=440, quality=68) if grp else '<div class="card-img img-missing">图片暂缺</div>'
        out.append(
            '<div class="acard">' + img + '<div class="body">'
            '<h3>%s</h3><div class="en">%s</div>'
            '<p class="desc">%s</p>'
            '<div class="kv"><span>📍 %s</span><span>💰 %s</span></div>'
            "</div></div>" % (esc(it["name"]), esc(it["en"]), esc(it["note"]), esc(it["where"]), esc(it["price"])))
    return '<div class="grid g3">%s</div>' % "\n".join(out)


def render_prose(html_text):
    return html_text


def main():
    body = open(os.path.join(ROOT, "content", "body.html"), encoding="utf-8").read()
    css = open(os.path.join(ROOT, "content", "theme.css"), encoding="utf-8").read()
    js = open(os.path.join(ROOT, "content", "app.js"), encoding="utf-8").read()

    flights = load("flights.json")
    cal = load("calendar.json")
    sg_map = load("sg_map.json")
    kl_map = load("kl_map.json")
    melaka_map = load("melaka_map.json")
    penang_map = load("penang_map.json")
    jb_map = load("jb_map.json")
    food = load("food.json")
    prose = load("prose.json") if os.path.exists(os.path.join(ROOT, "content", "prose.json")) else {}

    sg_ctrip = load_ctrip("singapore")
    kl_ctrip = load_ctrip("kualalumpur")
    melaka_ctrip = load_ctrip("melaka")
    penang_ctrip = load_ctrip("penang")

    manifests = []
    for g in ("singapore", "malaysia"):
        p = os.path.join(ROOT, "images", "manifest-%s.json" % g)
        if os.path.exists(p):
            manifests.append(json.load(open(p, encoding="utf-8")))

    tokens = {
        "CSS": css,
        "JS": js,
        "UPDATED": "2026-10-11（沙箱生成日期）",
        "FLIGHTS_OUT": render_flights(flights["outbound"]),
        "FLIGHTS_RET": render_flights(flights["inbound"]),
        "PRICE_CAL": render_calendars(cal["calendars"]),
        "BOOKING_TIPS": render_tips(cal["booking_tips"]),
        "FLIGHT_PICKS": render_picks(cal["picks"]),
        "SG_CARDS": render_cards(sg_map, sg_ctrip, "singapore"),
        "KL_CARDS": render_cards(kl_map, kl_ctrip, "malaysia"),
        "MELAKA_CARDS": render_cards(melaka_map, melaka_ctrip, "malaysia"),
        "PENANG_CARDS": render_cards(penang_map, penang_ctrip, "malaysia"),
        "JB_CARDS": render_cards(jb_map, load_ctrip("johorbahru"), "malaysia"),
        "SG_FOOD": render_food(food["sg"], "singapore"),
        "MY_FOOD": render_food(food["my"], "malaysia"),
        "CREDITS": credits(manifests),
    }
    for k, v in prose.items():
        tokens[k] = v

    prose_dir = os.path.join(ROOT, "content", "prose")
    if os.path.isdir(prose_dir):
        for fn in sorted(os.listdir(prose_dir)):
            if fn.endswith(".html"):
                tokens[fn[:-5].upper()] = open(os.path.join(prose_dir, fn), encoding="utf-8").read()

    deferred = {"IMGCOUNT"}

    def sub(m):
        key = m.group(1)
        if key in tokens:
            return tokens[key]
        return m.group(0) if key in deferred else "<!-- missing:%s -->" % key

    html = body
    for _ in range(5):
        html = re.sub(r"\{\{IMG:([a-z0-9_]+)\}\}",
                      lambda m: img_tag(m.group(1), find_image(m.group(1)) or "malaysia", m.group(1), width=440, quality=68), html)
        html, n = re.subn(r"\{\{([A-Z_]+)\}\}", sub, html)
        if not n:
            break
    html = html.replace("{{IMGCOUNT}}", str(html.count("<img")))
    out_path = os.path.join(ROOT, "singapore-malaysia-november-guide.html")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n"
                 "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
                 "<title>新加坡 × 马来西亚 11 月不走回头路 · 完整攻略</title>\n"
                 "<meta name=\"description\" content=\"2026 年 11 月 新加坡+马来西亚 6-10 天不走回头路攻略：实时机票价格、路线、景点评分、城际交通、出入境与预算\">\n"
                 "<style>\n" + css + "\n</style>\n</head>\n<body>\n" + html + "\n</body>\n</html>\n")
    print("wrote %s (%.1f MB)" % (out_path, os.path.getsize(out_path) / 1048576.0))
    missing = re.findall(r"<!-- missing:([A-Z_]+) -->", html)
    if missing:
        print("MISSING TOKENS:", sorted(set(missing)))


if __name__ == "__main__":
    main()

