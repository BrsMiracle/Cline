#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scrape a flight route page and print only the price/route facts.

Trip.com / AirAsia MOVE route pages are large (0.5-2 MB). Rather than pulling
whole pages into context, this strips tags and prints only the sentences that
carry a price, a flight number, a duration or a nonstop/stop hint.

Usage: python3 tools/scrape_route.py <url> [keyword ...]
"""
import html
import re
import subprocess
import sys

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

MONEY = re.compile(r"(?:US\$|HK\$|SGD|MYR|RM|CNY|HKD|S\$|£|€|\$)\s?[\d,]+(?:\.\d+)?")
DUR = re.compile(r"\d+\s*(?:小时|h|hrs?|minutes|分鐘|分钟)\s*(?:\d+\s*(?:分钟|min|m))?")
FLTNO = re.compile(r"\b(?:AK|MH|TR|SQ|ZH|CZ|CA|CX|OD|UO|9C|AQ|FY|BI|SL|FD|VJ|3U|MF|PR|GA|EK|QR|TK|HX|KA)\s?\d{2,4}\b")
HINT = re.compile(r"(直航|直飞|Nonstop|non-stop|direct|中转|stop|Duration|duration|平均|最便宜|最低|cheapest|from)")


def curl(url):
    return subprocess.run(["curl", "-sSL", "-m", "45", "-A", UA, url],
                          capture_output=True, check=False).stdout.decode("utf-8", "replace")


def sentences(text):
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.S)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text)
    # split into coarse chunks on CJK full stop / semicolon / 2+ spaces already collapsed
    parts = re.split(r"(?<=[。；!?])|(?<=·)|(?<=\.)\s", text)
    return [p.strip() for p in parts if p.strip()]


def main():
    url = sys.argv[1]
    extra = sys.argv[2:]
    raw = curl(url)
    print("URL:", url, "| bytes:", len(raw))
    hits, seen = [], set()
    for s in sentences(raw):
        if len(s) < 8 or len(s) > 320:
            continue
        if not (MONEY.search(s) or FLTNO.search(s) or DUR.search(s)):
            continue
        if not HINT.search(s) and not FLTNO.search(s):
            continue
        if any(k and k not in s for k in extra):
            continue
        key = re.sub(r"\d", "#", s)[:90]
        if key in seen:
            continue
        seen.add(key)
        hits.append(s)
    for s in hits[:70]:
        print(" -", s)
    if not hits:
        print(" (no price/flight facts matched)")


if __name__ == "__main__":
    main()
