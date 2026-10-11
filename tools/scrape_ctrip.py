#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scrape Ctrip (you.ctrip.com) attraction list pages into a compact TSV.

Each list page embeds an `attractionList` JSON array whose cards carry
poiName / commentScore / commentCount / price / isFree / zoneName / detailUrl.
We only keep those fields so the result stays small enough to review by hand.

Usage: python3 tools/scrape_ctrip.py <cityId> <slug> [pages]
Writes: research/ctrip-<slug>.tsv
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def curl(url):
    out = subprocess.run(
        ["curl", "-sSL", "-m", "45", "-A", UA, url],
        capture_output=True, check=False).stdout
    return out.decode("utf-8", "replace")


def parse_cards(html):
    i = html.find('"attractionList"')
    if i < 0:
        return []
    start = html.find("[", i)
    depth = 0
    end = None
    for j in range(start, min(len(html), start + 400000)):
        if html[j] == "[":
            depth += 1
        elif html[j] == "]":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    if end is None:
        return []
    try:
        arr = json.loads(html[start:end])
    except Exception:  # noqa: BLE001
        return []
    out = []
    for item in arr:
        card = item.get("card") if isinstance(item, dict) and "card" in item else item
        if not isinstance(card, dict) or "poiName" not in card:
            continue
        out.append(card)
    return out


def main():
    city_id, slug = sys.argv[1], sys.argv[2]
    pages = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    seen, rows = set(), []
    for p in range(pages):
        url = "https://you.ctrip.com/sight/%s%s/s0-p%d.html" % (slug, city_id, p)
        html = curl(url)
        cards = parse_cards(html)
        if not cards:
            print("page %d: no cards (%s)" % (p, url))
        for c in cards:
            name = c.get("poiName")
            if not name or name in seen:
                continue
            seen.add(name)
            rows.append({
                "name": name,
                "score": c.get("commentScore"),
                "reviews": c.get("commentCount"),
                "price_cny": c.get("price"),
                "market_price": c.get("marketPrice"),
                "free": c.get("isFree"),
                "price_type": c.get("priceTypeDesc"),
                "zone": c.get("zoneName"),
                "heat": c.get("heatScore"),
                "level": c.get("sightLevelStr"),
                "tags": ",".join((c.get("tagNameList") or [])[:4]),
                "features": (c.get("shortFeatures") or "")[:180],
                "detail": c.get("detailUrl"),
            })
    out = os.path.join(ROOT, "research", "ctrip-%s.tsv" % slug)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cols = ["name", "score", "reviews", "price_cny", "market_price", "free", "price_type",
            "zone", "heat", "level", "tags", "features", "detail"]
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\t".join(cols) + "\n")
        for r in rows:
            fh.write("\t".join(str(r.get(c, "") if r.get(c) is not None else "").replace("\t", " ").replace("\n", " ") for c in cols) + "\n")
    print("%s: %d attractions -> %s" % (slug, len(rows), out))
    for r in rows[:8]:
        print("   %s | %s分 %s条 | ¥%s | %s" % (r["name"], r["score"], r["reviews"], r["price_cny"], r["zone"]))


if __name__ == "__main__":
    main()
