#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the single-route guide (Singapore -> JB -> Melaka -> KL -> Penang).

Reuses every renderer from build.py so both HTML files stay visually identical;
only the content sources differ.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B  # noqa: E402

ROOT = B.ROOT
OUT = os.path.join(ROOT, "singapore-malaysia-main-route-guide.html")


def load(name):
    with open(os.path.join(ROOT, "content", "route", name), encoding="utf-8") as fh:
        return json.load(fh)


def render_flight_block(title, rows_in, rows_out, label_in, label_out):
    cols = [("route", "航线", ""), ("low", "11 月最低价", "price"), ("when", "低价日期", ""),
            ("plat", "来源平台", ""), ("detail", "航班与说明", ""), ("bag", "行李", "")]
    return ('<h3 style="margin:24px 0 10px;font-size:18px">%s</h3>'
            '<h4 style="margin:12px 0 6px;font-size:15.5px">%s</h4><div class="tw">%s</div>'
            '<h4 style="margin:16px 0 6px;font-size:15.5px">%s</h4><div class="tw">%s</div>'
            % (B.esc(title), B.esc(label_in), B.render_rows(rows_in, cols),
               B.esc(label_out), B.render_rows(rows_out, cols)))


def render_land(legs):
    out = []
    for leg in legs:
        rows = []
        for r in leg["rows"]:
            rows.append("<tr><td><b>%s</b></td><td>%s</td><td class='price'>%s</td><td>%s</td><td>%s</td></tr>"
                        % (B.esc(r["mode"]), r["detail"], B.esc(r["price"]), B.esc(r["time"]), B.esc(r["note"])))
        tips = "".join("<li>%s</li>" % t for t in leg["tips"])
        out.append(
            '<div class="card pad" style="margin-bottom:18px">'
            '<h3 style="margin:0 0 4px;font-size:18px"><span class="badge air">%s</span> %s</h3>'
            '<p style="margin:0 0 12px;color:#7b8798;font-size:13.4px">%s → %s</p>'
            '<div class="tw"><table><thead><tr><th>方式</th><th>具体怎么走</th><th>票价</th><th>耗时</th><th>备注</th></tr></thead>'
            "<tbody>%s</tbody></table></div>"
            '<div class="note" style="margin-top:12px"><ul style="margin:0;padding-left:18px">%s</ul></div>'
            "</div>"
            % (B.esc(leg["no"]), B.esc(leg["title"]), B.esc(leg["from"]), B.esc(leg["to"]), "".join(rows), tips))
    return "\n".join(out)


def render_totals(rows, conclusion):
    cols = [("plan", "方案", ""), ("calc", "计算方式", ""), ("rmb", "两张机票合计", "price"), ("note", "说明", "")]
    return ('<h3 style="margin:24px 0 10px;font-size:18px">两个方向的总价对比</h3>'
            '<div class="tw">%s</div>'
            '<div class="note ok" style="margin-top:14px">%s</div>' % (B.render_rows(rows, cols), conclusion))



def main():
    body = open(os.path.join(ROOT, "content", "route-body.html"), encoding="utf-8").read()
    css = open(os.path.join(ROOT, "content", "theme.css"), encoding="utf-8").read()
    js = open(os.path.join(ROOT, "content", "app.js"), encoding="utf-8").read()

    flights = load("flights.json")
    land = load("land.json")
    food = B.load("food.json")

    manifests = []
    for g in ("singapore", "malaysia"):
        p = os.path.join(ROOT, "images", "manifest-%s.json" % g)
        if os.path.exists(p):
            manifests.append(json.load(open(p, encoding="utf-8")))

    def city_block(title, subtitle, items, group, ctrip):
        return ('<h3 style="margin:34px 0 6px;font-size:19px">%s</h3>'
                '<p style="margin:0 0 14px;color:var(--ink-2);font-size:14.2px">%s</p>%s'
                % (B.esc(title), B.esc(subtitle), B.render_cards(items, ctrip, group)))

    cities = "\n".join([
        city_block("🇸🇬 新加坡（3 天）", "这趟行程的起点。物价最高，建议把贵门票和住宿安排在这里的前半段，越往北越省钱。",
                   B.load("sg_map.json"), "singapore", B.load_ctrip("singapore")),
        city_block("🇲🇾 新山 Johor Bahru（1–2 天，顺路玩）", "过关后的第一站。除乐高乐园外，市区看点集中在 Jalan Trus 一带，半天到一天足够。",
                   B.load("jb_map.json"), "malaysia", B.load_ctrip("johorbahru")),
        city_block("🏛️ 马六甲 Melaka（1–2 天，世界遗产）", "没有机场、没有火车站，正好卡在新山与吉隆坡之间——这也是它必须放在主线中段的原因。鸡场街夜市只有周五至周日晚。",
                   B.load("melaka_map.json"), "malaysia", B.load_ctrip("melaka")),
        city_block("🏙️ 吉隆坡 Kuala Lumpur（2–3 天）", "南北之间的枢纽：ETS 火车北上槟城、南下新山，飞回珠三角的航班也最多。",
                   B.load("kl_map.json"), "malaysia", B.load_ctrip("kualalumpur")),
        city_block("🏆 槟城 Penang（2 天，本线终点）", "世界遗产老城＋全马公认最好吃的地方，也是这条线最便宜的出境口岸（飞香港 11 月最低 HK$692）。",
                   B.load("penang_map.json"), "malaysia", B.load_ctrip("penang")),
    ])

    tokens = {
        "CSS": css, "JS": js,
        "UPDATED": "2026-10-11（沙箱生成日期）",
        "FX_BAR": B.FX_BAR_HTML,
        "FLIGHTS_BODY": (render_flight_block(flights["dirA"]["title"], flights["dirA"]["in"], flights["dirA"]["out"],
                                             "去程 · 珠三角 → 新加坡", "回程 · 槟城 → 珠三角")
                         + render_flight_block(flights["dirB"]["title"], flights["dirB"]["in"], flights["dirB"]["out"],
                                               "去程 · 珠三角 → 槟城", "回程 · 新加坡 → 珠三角")
                         + render_totals(flights["totals"], flights["conclusion"])),
        "LAND_BODY": render_land(land["legs"]),
        "LAND_REVERSE": "".join('<div class="note" style="margin-top:6px"><b>%s</b>%s</div>'
                                % (B.esc(t["t"]), t["d"]) for t in land["reverse"]),
        "CITIES_BODY": cities,
        "FOOD_BODY": ('<h3 style="margin:6px 0 12px;font-size:18px">🇸🇬 新加坡必吃</h3>' + B.render_food(food["sg"], "singapore")
                      + '<h3 style="margin:30px 0 12px;font-size:18px">🇲🇾 马来西亚必吃（新山 / 马六甲 / 吉隆坡 / 槟城一路吃）</h3>'
                      + B.render_food(food["my"], "malaysia")),
        "CREDITS": B.credits(manifests),
    }

    pdir = os.path.join(ROOT, "content", "route", "prose")
    for fn in sorted(os.listdir(pdir)):
        if fn.endswith(".html"):
            tokens[fn[:-5].upper()] = open(os.path.join(pdir, fn), encoding="utf-8").read()

    deferred = {"IMGCOUNT"}

    def sub(m):
        k = m.group(1)
        if k in tokens:
            return tokens[k]
        return m.group(0) if k in deferred else "<!-- missing:%s -->" % k

    html = body
    for _ in range(5):
        html = re.sub(r"\{\{IMG:([a-z0-9_]+)\}\}",
                      lambda m: B.img_tag(m.group(1), B.find_image(m.group(1)) or "malaysia",
                                          m.group(1), width=440, quality=68), html)
        html, n = re.subn(r"\{\{([A-Z_]+)\}\}", sub, html)
        if not n:
            break
    html = html.replace("{{IMGCOUNT}}", str(html.count("<img")))
    html = B.add_cny(html)

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n"
                 "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
                 "<title>新加坡→新山→马六甲→吉隆坡→槟城 · 主线攻略</title>\n"
                 "<meta name=\"description\" content=\"一条主线走到底：新加坡、新山、马六甲、吉隆坡、槟城 10 天行程，含机票价格、陆路交通详解、景点门票与预算\">\n"
                 "<style>\n" + css + "\n</style>\n</head>\n<body>\n" + html + "\n</body>\n</html>\n")
    print("wrote %s (%.1f MB)" % (OUT, os.path.getsize(OUT) / 1048576.0))
    missing = sorted(set(re.findall(r"<!-- missing:([A-Z_]+) -->", html)))
    if missing:
        print("MISSING TOKENS:", missing)


if __name__ == "__main__":
    main()
