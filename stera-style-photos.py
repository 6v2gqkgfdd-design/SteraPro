#!/usr/bin/env python3
"""
Stera-stijl foto-batch voor de Shopify-webshop.

Loopt alle producten (vendor SteraPro) af en vervangt de productfoto door
een bewerkte versie in de Stera-huisstijl: warme beige achtergrond
(zoals stera.be) + zachte schaduw onder de plant.

- Idempotent/hervatbaar: verwerkte producten krijgen de tag
  "fotostijl-ok" en worden bij een volgende run overgeslagen.
- Draaien (op de Mac, met Pillow-venv):
    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow
    /tmp/venv/bin/python stera-style-photos.py
  Vereiste env-vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET (zoals in .env.local).
"""

import json, os, statistics, subprocess, sys, tempfile, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-04/graphql.json"
BEIGE = (243, 225, 198)
TAG = "fotostijl-ok"

from PIL import Image, ImageDraw, ImageFilter, ImageChops


def token():
    body = (
        f"grant_type=client_credentials&client_id={os.environ['SHOPIFY_CLIENT_ID']}"
        f"&client_secret={os.environ['SHOPIFY_CLIENT_SECRET']}"
    )
    r = subprocess.run(
        ["curl", "-s", f"https://{SHOP}/admin/oauth/access_token",
         "-H", "Content-Type: application/x-www-form-urlencoded", "-d", body],
        capture_output=True, text=True)
    return json.loads(r.stdout)["access_token"]


TOK = token()


def gql(q, v=None):
    p = json.dumps({"query": q, "variables": v or {}})
    for attempt in range(4):
        r = subprocess.run(
            ["curl", "-s", "--max-time", "60", API,
             "-H", f"X-Shopify-Access-Token: {TOK}",
             "-H", "Content-Type: application/json", "-d", p],
            capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
        except Exception:
            time.sleep(3); continue
        if d.get("errors") and any("THROTTLED" in str(e) for e in d["errors"]):
            time.sleep(4); continue
        return d
    raise RuntimeError("gql faalt herhaaldelijk")


def detect_bg(im):
    w, h = im.size; px = im.load(); s = []
    for x in range(0, w, max(1, w // 40)):
        s += [px[x, 3], px[x, h - 4]]
    for y in range(0, h, max(1, h // 40)):
        s += [px[3, y], px[w - 4, y]]
    return (statistics.median(v[0] for v in s),
            statistics.median(v[1] for v in s),
            statistics.median(v[2] for v in s))


def stera_style(im):
    im = im.convert("RGB")
    if max(im.size) > 1200:
        im.thumbnail((1200, 1200), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    border = np.concatenate([a[3, :], a[-4, :], a[:, 3], a[:, -4]])
    bg = np.median(border, axis=0)
    bglum = max(1.0, float(bg.mean()))
    d = np.max(np.abs(a - bg), axis=2)
    t = np.clip(1.0 - d / 90.0, 0, 1)
    t = t * t * (3 - 2 * t)
    t[d >= 90] = 0
    lum = np.clip(a.mean(axis=2) / bglum, 0, 1)
    beige = np.array(BEIGE, dtype=np.float32)
    out = a * (1 - t)[..., None] + beige[None, None, :] * (lum * t)[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def add_shadow(im):
    w, h = im.size
    a = np.asarray(im).astype(np.int32)
    obj = np.abs(a - np.array(BEIGE)).sum(axis=2) > 120
    rows = np.where(obj.any(axis=1))[0]
    if len(rows) == 0:
        return im
    lowest = int(rows.max())
    strip = obj[max(0, lowest - int(h * 0.04)):lowest + 1]
    cols = np.where(strip.any(axis=0))[0]
    if len(cols) == 0:
        return im
    x0, x1 = int(cols.min()), int(cols.max()); cx = (x0 + x1) // 2
    ew = int(max(40, x1 - x0) * 1.5); eh = max(14, int(ew * 0.16))
    cy = min(h - 1, lowest + int(eh * 0.15))
    sh = Image.new("L", (w, h), 0)
    ImageDraw.Draw(sh).ellipse([cx - ew // 2, cy - eh // 2, cx + ew // 2, cy + eh // 2], fill=70)
    sh = sh.filter(ImageFilter.GaussianBlur(radius=max(8, ew // 10)))
    return ImageChops.subtract(im, Image.merge("RGB", [sh.point(lambda v: int(v * 0.55))] * 3))


def staged_upload(path, fname):
    d = gql("""mutation su($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message } } }""",
        {"input": [{"filename": fname, "mimeType": "image/jpeg",
                    "httpMethod": "POST", "resource": "IMAGE"}]})
    tgt = d["data"]["stagedUploadsCreate"]["stagedTargets"][0]
    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", tgt["url"]]
    for p in tgt["parameters"]:
        cmd += ["-F", f"{p['name']}={p['value']}"]
    cmd += ["-F", f"file=@{path}"]
    for attempt in range(4):
        code = subprocess.run(cmd, capture_output=True, text=True).stdout
        if code in ("200", "201", "204"):
            return tgt["resourceUrl"]
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"upload {code}")


stats = {"done": 0, "fout": 0}


def process_product(p):
    try:
        imgs = [m for m in p["media"]["nodes"] if m.get("image")]
        if not imgs:
            gql('mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }',
                {"id": p["id"], "tags": [TAG, "geen-foto"]})
            return
        url = imgs[0]["image"]["url"]
        old_ids = [m["id"] for m in imgs]
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            raw = f.name
        for attempt in range(4):
            r = subprocess.run(["curl", "-s", "-L", "--max-time", "60",
                                "--retry", "2", url, "-o", raw])
            if r.returncode == 0 and os.path.getsize(raw) > 1000:
                break
            time.sleep(3 * (attempt + 1))
        else:
            raise RuntimeError("download blijft falen")
        im = Image.open(raw)
        im = add_shadow(stera_style(im))
        out = raw.replace(".jpg", "_stera.jpg")
        im.save(out, "JPEG", quality=88)
        res_url = staged_upload(out, "stera-" + p["id"].split("/")[-1] + ".jpg")
        cr = gql("""mutation($pid: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $pid, media: $media) {
            media { id } mediaUserErrors { message } } }""",
            {"pid": p["id"], "media": [{"originalSource": res_url,
                                        "mediaContentType": "IMAGE"}]})
        errs = cr["data"]["productCreateMedia"]["mediaUserErrors"]
        if errs:
            raise RuntimeError(str(errs))
        gql("""mutation($pid: ID!, $ids: [ID!]!) {
          productDeleteMedia(productId: $pid, mediaIds: $ids) {
            deletedMediaIds mediaUserErrors { message } } }""",
            {"pid": p["id"], "ids": old_ids})
        gql('mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }',
            {"id": p["id"], "tags": [TAG]})
        stats["done"] += 1
        os.unlink(raw); os.unlink(out)
    except Exception as e:
        stats["fout"] += 1
        print(f"FOUT {p['title']}: {e}", flush=True)
    n = stats["done"] + stats["fout"]
    if n % 20 == 0:
        print(f"voortgang: {stats['done']} ok / {stats['fout']} fout", flush=True)


def main():
    # De query filtert op -tag:fotostijl-ok; verwerkte producten verdwijnen
    # dus vanzelf uit de eerste pagina. Telkens de eerste 50 opvragen tot op.
    lege_rondes = 0
    while True:
        d = gql("""query {
          products(first: 50, query: "vendor:SteraPro -tag:%s") {
            nodes { id title
              media(first: 5) { nodes { id ... on MediaImage { image { url } } } } } } }""" % TAG)
        prods = d["data"]["products"]["nodes"]
        if not prods:
            lege_rondes += 1
            if lege_rondes >= 2:
                break
            time.sleep(5)
            continue
        lege_rondes = 0
        with ThreadPoolExecutor(max_workers=4) as ex:
            list(ex.map(process_product, prods))
    print(f"KLAAR: {stats['done']} ok, {stats['fout']} fout", flush=True)


if __name__ == "__main__":
    main()
