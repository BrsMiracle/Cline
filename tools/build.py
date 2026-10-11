#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a single self-contained HTML travel guide (images inlined as base64).

Usage:  python3 tools/build.py
Reads:  content/*.json  +  images/manifest-*.json
Writes: singapore-malaysia-november-guide.html
"""
import base64
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "singapore-malaysia-november-guide.html")

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

CACHE = {}


def load(name):
    with open(os.path.join(ROOT, "content", name), encoding="utf-8") as fh:
        return json.load(fh)


def data_uri(path, width=760, quality=74):
    """Inline a local image as a compact base64 JPEG data URI."""
    key = (path, width, quality)
    if key in CACHE:
        return CACHE[key]
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        CACHE[key] = ""
        return ""
    with open(full, "rb") as fh:
        raw = fh.read()
    if Image is not None:
        try:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            if img.width > width:
                img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
            raw = buf.getvalue()
        except Exception:  # noqa: BLE001
            pass
    uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    CACHE[key] = uri
    return uri


def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def img_tag(slug, group, alt, cls="card-img", width=760, quality=74):
    uri = data_uri("images/%s/%s.jpg" % (group, slug), width, quality)
    if not uri:
        return '<div class="%s img-missing">图片暂缺</div>' % cls
    return '<img class="%s" src="%s" alt="%s" loading="lazy">' % (cls, uri, esc(alt))


def credits(manifests):
    rows = []
    for man in manifests:
        for rec in man["images"]:
            rows.append(rec)
    rows.sort(key=lambda r: (r.get("title") or "").lower())
    out = []
    for r in rows:
        author = r.get("author") or "见来源页"
        lic = r.get("license") or "见来源页"
        src = r.get("source") or ""
        link = '<a href="%s" target="_blank" rel="noopener">%s</a>' % (esc(src), esc(r.get("title", ""))) if src else esc(r.get("title", ""))
        out.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (link, esc(author), esc(lic), esc(r.get("caption", ""))))
    return "\n".join(out)
