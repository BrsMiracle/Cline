#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pull headline price + November calendar out of an AirAsia MOVE route page.

These pages are ~0.4 MB each; only the price facts matter, so the HTML is
stripped and matched with tight regexes instead of being dumped whole.
"""
import glob
import html
import re
import sys

TITLE = re.compile(r"平機票\s*([^\|]{2,40}?)\s*起")


def text_of(path):
    s = open(path, encoding="utf-8", errors="replace").read()
    s = re.sub(r"<script.*?</script>", " ", s, flags=re.S)
    s = re.sub(r"<style.*?</style>", " ", s, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s)))


def facts(t):
    out = {}
    m = TITLE.search(t)
    out["headline"] = m.group(0) if m else "未查到"
    m = re.search(r"(\d+月最低價[^查]{0,80}?)(?:查看|$)", t)
    out["month_low"] = m.group(1).strip() if m else "未查到"
    # November day-by-day calendar
    cal = {}
    seg = t
    i = seg.find("按日期查看航班")
    if i > 0:
        seg = seg[i:i + 3000]
        for m in re.finditer(r"(\d+)月(\d+)日(?:週.)?\s*(?:HKD|MYR|SGD|CNY|USD)?\s*([\d,]+|查看)", seg):
            if m.group(1) == "11":
                cal[m.group(2)] = m.group(3)
    out["nov"] = cal
    out["dir_airlines"] = (re.search(r"直航[^。]{0,20}嘅航班由([^。]{0,220})", t) or [None, ""])[1] if "直航" in t else ""
    out["duration"] = (re.search(r"大約需要([^。]{0,30})", t) or [None, ""])[1] if "大約需要" in t else ""
    return out


if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob("research/pen/*.html"))
    for f in files:
        t = text_of(f)
        d = facts(t)
        print("=" * 4, f.split("/")[-1])
        print("  標題:", d["headline"])
        print("  月度最低:", d["month_low"])
        print("  飛行時長:", d["duration"] or "未查到")
        print("  直飛航司:", (d["dir_airlines"] or "未查到")[:200])
        nov = d["nov"]
        if nov:
            print("  11月日曆:", ", ".join("%s日=%s" % (k, v) for k, v in sorted(nov.items(), key=lambda x: int(x[0]))))
        else:
            print("  11月日曆: 未查到")
