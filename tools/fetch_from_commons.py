#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Replace a card image with a real photo searched on Wikimedia Commons.

Needed because a handful of Wikipedia *lead* images are logos, coats of arms or
locally-hosted files rather than freely licensed photographs. This searches the
Commons file namespace, downloads the best bitmap hit and rewrites the manifest
entry with full author/license metadata.

Usage: python3 tools/fetch_from_commons.py <group> <slug> "<search query>" ["<caption>"]
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_images as F  # noqa: E402

BAD = re.compile(r"(logo|coat[_ ]of[_ ]arms|wappen|flag|map|diagram|icon|seal|emblem)", re.I)


def search(query, limit=12):
    q = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
         "&gsrnamespace=6&gsrlimit=%d&gsrsearch=%s&prop=imageinfo"
         "&iiprop=url|extmetadata|size&iiurlwidth=1280"
         % (limit, urllib.parse.quote(query + " filetype:bitmap")))
    data = F.api(q, tries=4)
    out = []
    for _, page in (data.get("query", {}).get("pages", {}) or {}).items():
        info = (page.get("imageinfo") or [{}])[0]
        title = page.get("title", "")
        if BAD.search(title):
            continue
        if info.get("width", 0) < 900:
            continue
        em = info.get("extmetadata", {})
        out.append({
            "title": title,
            "thumb": info.get("thumburl") or info.get("url"),
            "page": info.get("descriptionurl", ""),
            "author": re.sub(r"\{\{[^}]*\}\}", "", re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", ""))).strip(" ,;"),
            "license": em.get("LicenseShortName", {}).get("value", ""),
            "w": info.get("width"), "h": info.get("height"),
        })
    return out


def main():
    group, slug, query = sys.argv[1], sys.argv[2], sys.argv[3]
    caption = sys.argv[4] if len(sys.argv) > 4 else ""
    hits = search(query)
    if not hits:
        print("no usable Commons hit for", query)
        return 1
    best = hits[0]
    blob = F.download(best["thumb"])
    if len(blob) < 8000:
        print("download too small:", len(blob))
        return 1
    path = os.path.join(F.ROOT, "images", group, slug + ".jpg")
    with open(path, "wb") as fh:
        fh.write(blob)
    mp = os.path.join(F.ROOT, "images", "manifest-%s.json" % group)
    man = json.load(open(mp, encoding="utf-8"))
    rec = {"file": "images/%s/%s.jpg" % (group, slug), "slug": slug, "title": best["title"].replace("File:", ""),
           "caption": caption, "bytes": len(blob), "author": best["author"],
           "license": best["license"], "source": best["page"], "meta_error": ""}
    man["images"] = [r for r in man["images"] if r.get("slug") != slug] + [rec]
    json.dump(man, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK %-22s %7d B  %-18s %s" % (slug, len(blob), best["license"], best["title"]))
    print("   by", best["author"][:60], "|", best["page"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
