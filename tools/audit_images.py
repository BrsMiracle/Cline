#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audit the photos actually used in the guide.

Two failure modes showed up in practice:
  * a Wikipedia *lead* image can be a logo / coat of arms rather than a photo
    (e.g. "Petronas_Towers_Logo.svg", "Kuala_Lumpur_Tower_Logo.png")
  * a name-similar article can win the lookup and give the wrong subject
    (e.g. "Cloud Forest" -> Cloud_forest_mount_kinabalu.jpg, i.e. Mount Kinabalu
    in Sabah, not the Gardens by the Bay conservatory in Singapore)

This resolves every used slug back to its source file name (batched + cached so
we do not hammer the API) and flags anything suspicious for replacement.
"""
import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_images as F  # noqa: E402

ROOT = F.ROOT
CACHE = os.path.join(ROOT, "images", "pageimages.json")
BADWORD = re.compile(r"(logo|coat[_ ]of[_ ]arms|wappen|flag|map|diagram|icon|seal|emblem|signature|chart)", re.I)
STOP = set("the of and a to in for at by on de la le el singapore malaysia kuala lumpur ".split())


def used_slugs():
    """Slugs that the guide actually renders."""
    slugs = {}
    for fn in ("sg_map.json", "kl_map.json", "melaka_map.json", "penang_map.json", "jb_map.json"):
        p = os.path.join(ROOT, "content", fn)
        if not os.path.exists(p):
            continue
        for it in json.load(open(p, encoding="utf-8")):
            slugs[it["slug"]] = it.get("en") or it.get("ctrip") or it["slug"]
    food = os.path.join(ROOT, "content", "food.json")
    if os.path.exists(food):
        for grp in json.load(open(food, encoding="utf-8")).values():
            for it in grp:
                if it.get("slug"):
                    slugs.setdefault(it["slug"], it.get("en", ""))
    gal = os.path.join(ROOT, "content", "prose", "hero_gallery.html")
    if os.path.exists(gal):
        for m in re.finditer(r"\{\{IMG:([a-z0-9_]+)\}\}", open(gal, encoding="utf-8").read()):
            slugs.setdefault(m.group(1), "")
    return slugs


def load_cache():
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding="utf-8"))
    return {}


def resolve(titles, cache):
    todo = [t for t in titles if t and t not in cache]
    for i in range(0, len(todo), 40):
        chunk = todo[i:i + 40]
        q = ("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
             "&prop=pageimages&piprop=original|thumbnail&pithumbsize=1280&titles="
             + urllib.parse.quote("|".join(chunk)))
        try:
            d = F.api(q, tries=4)
        except Exception as exc:  # noqa: BLE001
            print("  batch failed:", exc)
            time.sleep(5)
            continue
        norm = {n["from"]: n["to"] for n in d.get("query", {}).get("normalized", [])}
        redir = {n["from"]: n["to"] for n in d.get("query", {}).get("redirects", [])}
        got = {}
        for _, page in d.get("query", {}).get("pages", {}).items():
            t = page.get("title")
            if not t or "missing" in page:
                continue
            src = (page.get("original") or {}).get("source") or (page.get("thumbnail") or {}).get("source")
            if src:
                got[t] = src.split("?")[0]
        for a, b in list(norm.items()) + list(redir.items()):
            if b in got and a not in got:
                got[a] = got[b]
        for t in chunk:
            cache[t] = got.get(t, "")
        time.sleep(2)
    return cache


def tokens(text):
    return {w for w in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(w) > 2 and w not in STOP}


def main():
    want = used_slugs()
    man = {}
    for grp in ("singapore", "malaysia"):
        p = os.path.join(ROOT, "images", "manifest-%s.json" % grp)
        if os.path.exists(p):
            for r in json.load(open(p, encoding="utf-8"))["images"]:
                man[r["slug"]] = (grp, r)
    cache = load_cache()
    titles = [man[s][1]["title"] for s in want if s in man]
    print("used slugs: %d | resolving %d titles..." % (len(want), len(titles)))
    resolve(titles, cache)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    flagged, missing_file = [], []
    for slug, label in sorted(want.items()):
        if slug not in man:
            missing_file.append(slug)
            continue
        grp, rec = man[slug]
        url = cache.get(rec["title"], "")
        fname = F.commons_file_name(url) if url else ""
        reasons = []
        if not url:
            reasons.append("no-pageimage")
        else:
            if BADWORD.search(fname):
                reasons.append("filename-looks-like-logo/icon")
            if "/wikipedia/commons/" not in url:
                reasons.append("not-on-commons(local)")
            ft, lt = tokens(fname), tokens(rec["title"])
            if ft and lt and not (ft & lt) and not (tokens(label) & ft):
                reasons.append("filename-vs-title-mismatch")
        if reasons:
            flagged.append((slug, grp, rec["title"], fname, reasons))
    print("\n=== flagged %d ===" % len(flagged))
    for slug, grp, title, fname, reasons in flagged:
        print("  %-26s %-8s %-28s %-44s %s" % (slug, grp, title[:28], fname[:44], ",".join(reasons)))
    if missing_file:
        print("\n=== used but NO image downloaded (%d) ===" % len(missing_file))
        print("  " + ", ".join(missing_file))


if __name__ == "__main__":
    main()
