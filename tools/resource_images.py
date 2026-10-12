#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-source every photo used by the guide from Commons *search* results.

Wikipedia lead images proved unreliable: some are logos or flags
("Petronas_Towers_Logo.svg", "Flag_of_Malacca.svg", "NSMLogo.png") and some are
the wrong subject ("Cloud Forest" -> Mount Kinabalu in Sabah). Searching the
Commons file namespace by the attraction's English name gives a photo of the
right subject whose licence is verifiable inline.

Old files are copied to images/_backup/ first so the swap can be undone.

Usage: python3 tools/resource_images.py [--only slug1,slug2] [--dry]
"""
import json
import os
import re
import shutil
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_images as F  # noqa: E402

ROOT = F.ROOT
BACKUP = os.path.join(ROOT, "images", "_backup")
BADWORD = re.compile(r"(logo|coat[_ ]of[_ ]arms|wappen|flag|diagram|icon|seal|emblem|signature|chart|map[_ ]of)", re.I)
STOP = set("the of and a to in for at by on de la le el singapore malaysia kuala lumpur penang".split())

MAPS = [("sg_map.json", "Singapore"), ("kl_map.json", "Kuala Lumpur"),
        ("melaka_map.json", "Malacca"), ("penang_map.json", "Penang"),
        ("jb_map.json", "Johor Bahru")]


def targets():
    out = {}
    for fn, city in MAPS:
        p = os.path.join(ROOT, "content", fn)
        if not os.path.exists(p):
            continue
        for it in json.load(open(p, encoding="utf-8")):
            name = (it.get("en") or "").strip()
            if name:
                out[it["slug"]] = "%s %s" % (name, city)
    p = os.path.join(ROOT, "content", "food.json")
    if os.path.exists(p):
        for grp, items in json.load(open(p, encoding="utf-8")).items():
            for it in items:
                if it.get("slug"):
                    out.setdefault(it["slug"], it.get("en") or it["name"])
    p = os.path.join(ROOT, "content", "prose", "hero_gallery.html")
    if os.path.exists(p):
        for m in re.finditer(r"\{\{IMG:([a-z0-9_]+)\}\}", open(p, encoding="utf-8").read()):
            out.setdefault(m.group(1), "")
    return out


def tokens(text):
    return {w for w in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(w) > 2 and w not in STOP}


def search(query, limit=20):
    q = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
         "&gsrnamespace=6&gsrlimit=%d&gsrsearch=%s&prop=imageinfo"
         "&iiprop=url|extmetadata|size&iiurlwidth=1400"
         % (limit, urllib.parse.quote(query + " filetype:bitmap")))
    d = F.api(q, tries=4)
    rows = []
    for _, page in (d.get("query", {}).get("pages", {}) or {}).items():
        info = (page.get("imageinfo") or [{}])[0]
        title = (page.get("title") or "").replace("File:", "")
        if BADWORD.search(title) or info.get("width", 0) < 1000:
            continue
        em = info.get("extmetadata", {})
        rows.append({
            "title": title,
            "thumb": info.get("thumburl") or info.get("url"),
            "page": info.get("descriptionurl", ""),
            "author": re.sub(r"\{\{[^}]*\}\}", "", re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", ""))).strip(" ,;") or "见来源页",
            "license": em.get("LicenseShortName", {}).get("value", "") or "见来源页",
            "w": info.get("width", 0), "h": info.get("height", 0),
        })
    return rows


def pick(rows, query):
    """Prefer a photo whose file name is a tight match for the subject.

    Commons file names are descriptive, so "Kuala Lumpur Tower.jpg" is a better
    signal than "Canopy of KL Forest Eco Park at Kuala Lumpur Tower.jpg": both
    contain the subject words, but the latter adds a lot of unrelated context.
    """
    qt = tokens(query)
    head = [w for w in re.split(r"[^a-z0-9]+", query.lower()) if len(w) > 2 and w not in STOP][:1]
    best, score = None, -1e9
    for r in rows:
        ft = tokens(r["title"])
        matched = len(qt & ft)
        extra = len(ft - qt)
        s = matched * 3.0 - extra * 0.7
        if head and head[0] in ft:
            s += 1.5
        if r["w"] >= 1600:
            s += 1
        if r["h"] and r["w"] / r["h"] > 2.4:
            s -= 3
        if s > score:
            best, score = r, s
    return best


def current_group(slug):
    for grp in ("singapore", "malaysia"):
        if os.path.exists(os.path.join(ROOT, "images", grp, slug + ".jpg")):
            return grp
    return None


def main():
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    dry = "--dry" in sys.argv
    os.makedirs(BACKUP, exist_ok=True)
    tgt = targets()
    done = fail = 0
    for slug, query in sorted(tgt.items()):
        if only and slug not in only:
            continue
        if not query:
            continue
        try:
            rows = search(query)
        except Exception as exc:  # noqa: BLE001
            print("SEARCHFAIL %-24s %s" % (slug, exc), flush=True)
            fail += 1
            time.sleep(5)
            continue
        best = pick(rows, query)
        if not best:
            print("NOHIT      %-24s (%s)" % (slug, query), flush=True)
            fail += 1
            time.sleep(2)
            continue
        if dry:
            print("DRY  %-24s -> %-54s %s" % (slug, best["title"][:54], best["license"]), flush=True)
            continue
        try:
            blob = F.download(best["thumb"])
        except Exception as exc:  # noqa: BLE001
            print("DLFAIL     %-24s %s" % (slug, exc), flush=True)
            fail += 1
            time.sleep(5)
            continue
        if len(blob) < 8000:
            print("TOOSMALL   %-24s %d B" % (slug, len(blob)), flush=True)
            fail += 1
            continue
        grp = current_group(slug) or "malaysia"
        dst = os.path.join(ROOT, "images", grp, slug + ".jpg")
        shutil.copy2(dst, os.path.join(BACKUP, grp + "__" + slug + ".jpg"))
        with open(dst, "wb") as fh:
            fh.write(blob)
        mp = os.path.join(ROOT, "images", "manifest-%s.json" % grp)
        man = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else {"group": grp, "images": [], "failed": []}
        man["images"] = [r for r in man["images"] if r.get("slug") != slug]
        man["images"].append({"file": "images/%s/%s.jpg" % (grp, slug), "slug": slug,
                              "title": best["title"], "caption": "", "bytes": len(blob),
                              "author": best["author"][:110], "license": best["license"],
                              "source": best["page"], "meta_error": ""})
        json.dump(man, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("OK  %-24s %7d B  %-18s %s" % (slug, len(blob), best["license"][:18], best["title"][:56]), flush=True)
        done += 1
        time.sleep(1.3)
    print("\nreplaced %d, failed %d" % (done, fail))


if __name__ == "__main__":
    main()

