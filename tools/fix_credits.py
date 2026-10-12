#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Batch-repair missing author/license metadata in the image manifests.

Per-image lookups hit Wikimedia's rate limiter hard (89 files x 2 APIs), so this
batches instead: Wikipedia's pageimages API resolves up to 40 page titles to
their original file URLs in one request, then the Commons imageinfo API resolves
up to 40 file titles in one request. Files that turn out to be locally hosted on
Wikipedia (and therefore possibly non-free) are reported so they can be swapped.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_images as F  # noqa: E402

UA = F.UA
ROOT = F.ROOT
BATCH = 40


def call(url, tries=5):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(4 * (i + 1))
    raise last


def pageimages(titles):
    out = {}
    for i in range(0, len(titles), BATCH):
        chunk = titles[i:i + BATCH]
        q = ("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
             "&prop=pageimages&piprop=original|thumbnail&pithumbsize=1280&titles="
             + urllib.parse.quote("|".join(chunk)))
        try:
            d = call(q)
        except Exception as exc:  # noqa: BLE001
            print("  pageimages batch failed:", exc)
            continue
        norm = {n["from"]: n["to"] for n in d.get("query", {}).get("normalized", [])}
        redir = {n["from"]: n["to"] for n in d.get("query", {}).get("redirects", [])}
        for _, page in d.get("query", {}).get("pages", {}).items():
            t = page.get("title")
            if not t or "missing" in page:
                continue
            src = (page.get("original") or {}).get("source") or (page.get("thumbnail") or {}).get("source")
            if src:
                out[t] = src.split("?")[0]
        for a, b in list(norm.items()) + list(redir.items()):
            if b in out and a not in out:
                out[a] = out[b]
        time.sleep(1.2)
    return out


def imageinfo(names, host):
    out = {}
    for i in range(0, len(names), BATCH):
        chunk = names[i:i + BATCH]
        q = ("https://%s/w/api.php?action=query&format=json&prop=imageinfo"
             "&iiprop=extmetadata|url&titles=" % host
             + urllib.parse.quote("|".join("File:" + n for n in chunk)))
        try:
            d = call(q)
        except Exception as exc:  # noqa: BLE001
            print("  imageinfo(%s) batch failed: %s" % (host, exc))
            continue
        for _, page in d.get("query", {}).get("pages", {}).items():
            t = (page.get("title") or "").replace("File:", "")
            info = (page.get("imageinfo") or [{}])[0]
            em = info.get("extmetadata", {})
            lic = em.get("LicenseShortName", {}).get("value", "")
            if lic:
                author = re.sub(r"\{\{[^}]*\}\}", "", re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", ""))).strip(" ,;")
                out[t] = (author[:110], lic, info.get("descriptionurl", ""))
        time.sleep(1.2)
    return out


def main():
    for grp in (sys.argv[1:] or ["singapore", "malaysia"]):
        path = os.path.join(ROOT, "images", "manifest-%s.json" % grp)
        man = json.load(open(path, encoding="utf-8"))
        todo = [r for r in man["images"] if not (r.get("license") or "").strip()]
        print("%s: %d entries, %d missing license" % (grp, len(man["images"]), len(todo)))
        if not todo:
            continue
        titles = [r["title"] for r in todo]
        imgs = pageimages(titles)
        print("  resolved %d/%d original file urls" % (len(imgs), len(titles)))
        by_name, local, nomap = {}, [], []
        for r in todo:
            url = imgs.get(r["title"])
            if not url:
                nomap.append(r["slug"])
                continue
            name = F.commons_file_name(url)
            by_name.setdefault(name, []).append(r)
            if "/wikipedia/commons/" not in url:
                local.append(r["slug"])
        meta = imageinfo(list(by_name.keys()), "commons.wikimedia.org")
        unresolved = [n for n in by_name if n not in meta]
        if unresolved:
            print("  %d file(s) not on Commons, retrying on en.wikipedia" % len(unresolved))
            meta.update(imageinfo(unresolved, "en.wikipedia.org"))
        fixed = 0
        for name, recs in by_name.items():
            m = meta.get(name)
            if not m:
                continue
            for r in recs:
                r["author"], r["license"], r["source"] = m
                r["meta_error"] = ""
                fixed += 1
        json.dump(man, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        still = [r["slug"] for r in man["images"] if not (r.get("license") or "").strip()]
        print("  fixed %d | still missing %d %s" % (fixed, len(still), still[:12]))
        if nomap:
            print("  no pageimage: %s" % nomap[:12])
        if local:
            print("  !! locally hosted (可能非自由版权，建议替换): %s" % local)


if __name__ == "__main__":
    main()
