#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enrich the Ctrip attraction TSV with opening hours / address / phone.

Reads research/ctrip-<slug>.tsv (produced by scrape_ctrip.py), fetches each
attraction detail page and pulls the fields out of the embedded __NEXT_DATA__
payload. Writes research/ctrip-<slug>-detail.tsv.
"""
import concurrent.futures as cf
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def curl(url):
    return subprocess.run(["curl", "-sSL", "-m", "45", "-A", UA, url],
                          capture_output=True, check=False).stdout.decode("utf-8", "replace")


def detail(url):
    raw = curl(url)
    m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw, re.S)
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
    except Exception:  # noqa: BLE001
        return {}
    poi = data.get("props", {}).get("pageProps", {}).get("initialState", {}).get("poiDetail", {})
    if not poi:
        return {}
    open_info = poi.get("openInfo") or {}
    ticket = poi.get("ticketInfo") or {}
    return {
        "hours": (open_info.get("openTime") or open_info.get("desc") or "").strip(),
        "address": (poi.get("address") or "").strip(),
        "phone": ",".join(poi.get("telephone") or []),
        "score": poi.get("commentScore"),
        "reviews": poi.get("commentCount"),
        "ticket": (ticket.get("price") if isinstance(ticket, dict) else "") or poi.get("price") or "",
        "traffic": (poi.get("trafficInfo") or {}).get("desc", "") if isinstance(poi.get("trafficInfo"), dict) else "",
    }


def clean(x):
    x = re.sub(r"\s+", " ", str(x or ""))
    return x.replace("\t", " ")


def main():
    slug = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    src = os.path.join(ROOT, "research", "ctrip-%s.tsv" % slug)
    rows = [l.rstrip("\n").split("\t") for l in open(src, encoding="utf-8")][1:]
    rows = [r for r in rows if len(r) >= 13 and r[12].startswith("http")][:limit]
    out = []
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(detail, r[12]): r for r in rows}
        for fut in cf.as_completed(futs):
            r = futs[fut]
            d = fut.result()
            out.append([r[0], r[1], r[2], r[3], r[7], clean(d.get("hours")), clean(d.get("address")),
                        clean(d.get("phone")), r[12]])
            print("OK  %-24s %s" % (r[0], clean(d.get("hours"))[:70]))
    order = {r[0]: i for i, r in enumerate(rows)}
    out.sort(key=lambda x: order.get(x[0], 999))
    dst = os.path.join(ROOT, "research", "ctrip-%s-detail.tsv" % slug)
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write("name\tscore\treviews\tprice_cny\tzone\thours\taddress\tphone\tdetail\n")
        for r in out:
            fh.write("\t".join(r) + "\n")
    print("%d rows -> %s" % (len(out), dst))


if __name__ == "__main__":
    main()
