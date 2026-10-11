#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract every flight snippet (with 直航/中轉 marker) from an AirAsia MOVE page.

The MOVE pages render cards like:
  "11月最低價 AirAsia 11月5日 (週四) 09:05 11月5日 10:10 KUL 1h 5m • 直航 PEN MYR 115"
so we can separate "cheapest overall" from "cheapest non-stop" and read the
airline / flight time / airport for each.
"""
import glob
import html
import re
import sys

CARD = re.compile(
    r"([^\s]{0,14}?最低價)\s+([A-Za-z][A-Za-z0-9 .&'\-]{2,40}?)\s+"
    r"(\d{1,2}月\d{1,2}日)\s*\(?週?[一二三四五六日]?\)?\s*"
    r"(\d{1,2}:\d{2})\s+(\d{1,2}月\d{1,2}日)\s+(\d{1,2}:\d{2})\s+"
    r"([A-Z]{3})\s+([\dhm\s]+?)\s*•\s*(直航|1次中轉|2次中轉|中轉)\s+([A-Z]{3})\s+"
    r"([A-Z]{3}\s?[\d,]+)")


def text_of(path):
    s = open(path, encoding="utf-8", errors="replace").read()
    s = re.sub(r"<script.*?</script>", " ", s, flags=re.S)
    s = re.sub(r"<style.*?</style>", " ", s, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s)))


def run(files):
    for f in files:
        t = text_of(f)
        print("=" * 6, f.split("/")[-1])
        seen = set()
        for m in CARD.finditer(t):
            label, airline, d1, dep, d2, arr, org, dur, typ, dst, price = m.groups()
            key = (label, d1, dep, price, typ)
            if key in seen:
                continue
            seen.add(key)
            if not d1.startswith("11月"):
                continue
            print("  %-12s %-26s %s %s %s->%s %s | %s | %s"
                  % (label, airline.strip(), d1, dep, org, dst, dur.strip(), typ, price))
        # month-lowest labelled cards regardless of month
        lows = [m.group(0) for m in re.finditer(r"11月最低價[^查]{0,140}", t)]
        for l in lows[:2]:
            print("  月標籤:", l.strip()[:150])


if __name__ == "__main__":
    run(sys.argv[1:] or sorted(glob.glob("research/pen/*.html")))
