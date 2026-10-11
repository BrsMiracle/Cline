#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Resolve hot-linkable Wikimedia Commons images with full credit metadata.

The Wikimedia Action API is rate-limited from shared IPs, so this uses the
public HTML/REST endpoints instead:
  1. fetch https://en.wikipedia.org/wiki/<Title> and take the first Commons JPEG
     rendered in the article body -> Commons file name + hash path;
  2. fetch https://commons.wikimedia.org/wiki/File:<name> and read the rendered
     licence short name + licence URL (licensetpl spans);
  3. fetch the file wikitext (?action=raw) for the author field;
  4. download the 1280px thumb with curl, record the HTTP status code;
  5. write images/manifest-<group>.json.

Nothing is invented: fields the pages do not expose stay empty and the record
carries an explicit error string.
"""
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH = 1280
FILE_OVERRIDES = {"singapore_skyline": "Singapore Marina Bay Dusk 2018-02-27.jpg"}
THUMB_RE = re.compile(r"(?:https?:)?//(?:thumb|upload)\.wikimedia\.org/wikipedia/commons/"
                      r"(?:thumb/)?([0-9a-f])/([0-9a-f]{2})/([^/\"]+?)(?:/\d+px-[^/\"]+)?[\"?]")


def curl(url, out=None, tries=4):
    for attempt in range(tries):
        cmd = ["curl", "-sS", "-L", "-A", UA]
        cmd += ["-o", out] if out else ["-o", "/dev/null"]
        cmd += ["-w", "%{http_code}", "--max-time", "90", url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=200)
        code = res.stdout.strip()
        if code == "200":
            return code, res.returncode
        time.sleep(2.5 * (attempt + 1))
    return code, res.returncode


def get_text(url, tries=4, min_len=2000):
    for attempt in range(tries):
        cmd = ["curl", "-sS", "-L", "-A", UA, "--max-time", "60", url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode == 0 and len(res.stdout) > min_len:
            return res.stdout
        time.sleep(2.5 * (attempt + 1))
    return ""


def article_image(title):
    page = get_text("https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")))
    best = None
    for m in THUMB_RE.finditer(page):
        name = urllib.parse.unquote(m.group(3))
        low = name.lower()
        if not low.endswith((".jpg", ".jpeg")) or "logo" in low:
            continue
        best = (m.group(1), m.group(2), m.group(3), name)
        break
    return best


def file_meta(file_name, h1=None, h2=None):
    quoted = urllib.parse.quote(file_name.replace(" ", "_"))
    page = get_text("https://commons.wikimedia.org/wiki/File:" + quoted)
    if not page:
        return {}
    u = html.unescape(page)
    if not h1 or not h2:
        m0 = re.search(r"upload\.wikimedia\.org/wikipedia/commons/(?:thumb/)?([0-9a-f])/([0-9a-f]{2})/", u)
        if m0:
            h1, h2 = m0.group(1), m0.group(2)
        else:
            return {}
    short = re.search(r'class="licensetpl_short"[^>]*>([^<]+)</span>', u)
    link = re.search(r'class="licensetpl_link"[^>]*>([^<]+)</span>', u)
    longn = re.search(r'class="licensetpl_long"[^>]*>([^<]+)</span>', u)
    author = ""
    raw = get_text("https://commons.wikimedia.org/w/index.php?title=File:%s&action=raw" % quoted, tries=2, min_len=40)
    m = re.search(r"\|\s*(?:author|artist)\s*=\s*(.+)", raw, re.I)
    if m:
        a = m.group(1).strip()
        a = re.sub(r"\{\{[^}]*?User:([^/}|}]+)[^}]*\}\}", r"\1", a)
        a = re.sub(r"\[\[([^\]|]+)\|?[^\]]*\]\]", r"\1", a)
        a = re.sub(r"<[^>]+>", "", a)
        author = re.sub(r"^User:", "", a)
        author = re.sub(r"\s+", " ", author).strip()[:110]
    thumb = "https://upload.wikimedia.org/wikipedia/commons/thumb/%s/%s/%s/%dpx-%s" % (
        h1, h2, quoted, WIDTH, quoted)
    return {"author": author, "license": (short.group(1).strip() if short else ""),
            "license_long": (longn.group(1).strip() if longn else ""),
            "license_url": (link.group(1).strip() if link else ""),
            "direct_url": "https://upload.wikimedia.org/wikipedia/commons/%s/%s/%s" % (h1, h2, quoted),
            "thumb_url": thumb,
            "source_page": "https://commons.wikimedia.org/wiki/File:" + quoted}


def run(items, group):
    outdir = os.path.join(ROOT, "images", group)
    os.makedirs(outdir, exist_ok=True)
    records, failed = [], []
    for slug, title, caption in items:
        rec = {"file": "images/%s/%s.jpg" % (group, slug), "slug": slug, "title": title,
               "caption": caption, "bytes": 0, "author": "", "license": "",
               "license_url": "", "direct_url": "", "thumb_url": "",
               "source_page": "", "wikipedia_page": "", "http_status": "", "error": ""}
        try:
            if slug in FILE_OVERRIDES:
                h1 = h2 = None
                name = FILE_OVERRIDES[slug]
            else:
                found = article_image(title)
                if not found:
                    raise RuntimeError("no commons JPEG in article")
                h1, h2, _q, name = found
            meta = file_meta(name, h1, h2)
            if not meta:
                raise RuntimeError("no commons file page for %s" % name)
            target = os.path.join(outdir, slug + ".jpg")
            code, _rc = curl(meta["thumb_url"], target)
            size = os.path.getsize(target) if os.path.exists(target) else 0
            rec.update({"bytes": size, "author": meta["author"], "license": meta["license"],
                        "license_url": meta["license_url"], "direct_url": meta["direct_url"],
                        "thumb_url": meta["thumb_url"], "source_page": meta["source_page"],
                        "wikipedia_page": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
                        "commons_file": name, "http_status": code})
            if code != "200" or size < 4000:
                raise RuntimeError("http %s, %d bytes" % (code, size))
            records.append(rec)
            print("OK   %-30s %7d B  %-18s %s" % (slug, size, rec["license"] or "?", rec["author"][:38]), flush=True)
        except Exception as exc:  # noqa: BLE001
            rec["error"] = repr(exc)[:160]
            failed.append(rec)
            print("FAIL %-30s %s" % (slug, rec["error"]), flush=True)
        time.sleep(1.0)
    mp = os.path.join(ROOT, "images", "manifest-%s.json" % group)
    with open(mp, "w") as fh:
        json.dump({"group": group, "images": records, "failed": failed}, fh, ensure_ascii=False, indent=1)
    print("\n%s: %d ok, %d failed -> %s" % (group, len(records), len(failed), mp))
    return len(failed)


if __name__ == "__main__":
    group = sys.argv[1]
    items = json.load(open(sys.argv[2], encoding="utf-8"))
    sys.exit(1 if run([tuple(i[:3]) for i in items], group) else 0)
