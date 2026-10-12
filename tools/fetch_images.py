#!/usr/bin/env python3
"""Fetch representative photos from Wikimedia Commons for the travel guide.

For each (slug, wikipedia_title, caption[, width]) it resolves the page's lead
image via the Wikipedia REST summary API, downloads a JPEG into
images/<group>/<slug>.jpg, resolves author + license via the Commons imageinfo
API, and writes images/manifest-<group>.json. Pages without a lead image are
reported as FAILED and skipped -- nothing is invented.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = "TravelGuideBuilder/1.0 (personal travel planning; contact: local)"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH = 1280
VALID_WIDTHS = [250, 330, 500, 1280, 1920]


def snap_width(w):
    for v in VALID_WIDTHS:
        if w <= v:
            return v
    return VALID_WIDTHS[-1]


def api(url, tries=5):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(3 * (attempt + 1))
    raise last


def download(url, tries=5):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(4 * (attempt + 1))
    raise last


def resolve_title(title):
    q = ("https://en.wikipedia.org/w/api.php?action=query&format=json&list=search"
         "&srlimit=1&srsearch=" + urllib.parse.quote(title))
    try:
        data = api(q, tries=3)
        hits = data.get("query", {}).get("search", [])
        if hits:
            return hits[0]["title"], True
    except Exception:  # noqa: BLE001
        pass
    return title, False


def get_summary(title):
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"))
    try:
        return api(url, tries=3)
    except Exception:  # noqa: BLE001
        alt, found = resolve_title(title)
        if not found:
            raise
        url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(alt.replace(" ", "_"))
        return api(url, tries=3)


def thumb_at(source, width=WIDTH):
    clean = source.split("?")[0]
    m = re.match(r"^(https://[^/]+/wikipedia/[^/]+/thumb/.+/)(\d+)px-(.+)$", clean)
    if m:
        return "%s%spx-%s" % (m.group(1), snap_width(width), m.group(3))
    return clean


def commons_file_name(url):
    """Real Commons file name from either an original or a thumbnail URL.

    The REST API sometimes hands back a thumb URL like
    .../thumb/2/2e/Foo.jpg/3840px-Foo.jpg, whose basename is NOT the file name.
    """
    name = urllib.parse.unquote(url.split("?")[0].split("/")[-1])
    return re.sub(r"^\d+px-", "", name)


def commons_meta(orig_url):
    name = commons_file_name(orig_url)
    q = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
         "&iiprop=extmetadata|url&titles=File:" + urllib.parse.quote(name))
    try:
        data = api(q, tries=3)
    except Exception as exc:  # noqa: BLE001
        return "", "", "", "meta-error: %s" % exc
    for _, page in data.get("query", {}).get("pages", {}).items():
        info = (page.get("imageinfo") or [{}])[0]
        em = info.get("extmetadata", {})
        author = re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "")).strip()
        lic = em.get("LicenseShortName", {}).get("value", "")
        return author[:110], lic, info.get("descriptionurl", ""), ""
    return "", "", "", "no imageinfo"


def fetch_one(item, group, outdir, done):
    slug, title, caption = item[0], item[1], item[2]
    width = item[3] if len(item) > 3 else WIDTH
    target = os.path.join(outdir, slug + ".jpg")
    if slug in done and os.path.exists(target):
        return ("skip", slug, title, None, width, None)
    try:
        s = get_summary(title)
        orig = (s.get("originalimage") or {}).get("source")
        th = (s.get("thumbnail") or {}).get("source")
        if not orig and not th:
            return ("fail", slug, title, "no lead image", width, None)
        url = thumb_at(th or orig, width) if th else orig
        blob = download(url)
        if len(blob) < 4000:
            return ("fail", slug, title, "too small: %d bytes" % len(blob), width, None)
        with open(target, "wb") as fh:
            fh.write(blob)
        author, lic, desc, err = commons_meta(orig or url)
        rec = {"file": "images/%s/%s.jpg" % (group, slug), "slug": slug, "title": title,
               "caption": caption, "bytes": len(blob), "author": author, "license": lic,
               "source": desc or s.get("content_urls", {}).get("desktop", {}).get("page", ""),
               "meta_error": err}
        return ("ok", slug, title, rec, width, len(blob))
    except Exception as exc:
        return ("fail", slug, title, repr(exc)[:140], width, None)


def fetch(items, group, workers=3):
    import concurrent.futures as cf
    import threading
    gate = threading.Semaphore(workers)
    pace = threading.Lock()
    last = [0.0]

    def throttled(item):
        with gate:
            with pace:
                wait = 0.9 - (time.time() - last[0])
                if wait > 0:
                    time.sleep(wait)
                last[0] = time.time()
            return fetch_one(item, group, outdir, done)

    outdir = os.path.join(ROOT, "images", group)
    os.makedirs(outdir, exist_ok=True)
    mp = os.path.join(ROOT, "images", "manifest-%s.json" % group)
    records, failed, done = [], [], set()
    if os.path.exists(mp):
        prev = json.load(open(mp))
        records = prev.get("images", [])
        failed = prev.get("failed", [])
        done = {r["slug"] for r in records}
    items = [tuple(i) for i in items]
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(throttled, it) for it in items]
        for fut in cf.as_completed(futures):
            kind, slug, title, payload, width, size = fut.result()
            if kind == "ok":
                records.append(payload)
                print("OK   %-32s %7d B  %-20s %s" % (slug, size, payload["license"] or "?", (payload["author"] or "")[:36]), flush=True)
            elif kind == "fail":
                failed.append([slug, title, payload])
                print("FAIL %-32s %s" % (slug, str(payload)[:100]), flush=True)
            with open(mp, "w") as fh:
                json.dump({"group": group, "images": records, "failed": failed}, fh, ensure_ascii=False, indent=1)
    with open(mp, "w") as fh:
        json.dump({"group": group, "images": records, "failed": failed}, fh, ensure_ascii=False, indent=1)
    print("\n%s: %d ok, %d failed -> %s" % (group, len(records), len(failed), mp))
    for slug, title, why in failed:
        print("  FAILED %s (%s): %s" % (slug, title, why))
    return len(failed)

if __name__ == "__main__":
    group = sys.argv[1]
    items = json.load(open(sys.argv[2]))
    sys.exit(1 if fetch([tuple(i) for i in items], group) else 0)

