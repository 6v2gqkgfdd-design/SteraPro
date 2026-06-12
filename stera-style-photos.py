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
    bgr, bgg, bgb = detect_bg(im)
    bglum = max(1, (bgr + bgg + bgb) / 3)
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = max(abs(r - bgr), abs(g - bgg), abs(b - bgb))
            if d >= 90:
                continue
            t = 1.0 - d / 90.0
            t = t * t * (3 - 2 * t)
            lum = min(1.0, (r + g + b) / 3.0 / bglum)
            px[x, y] = (int(r * (1 - t) + BEIGE[0] * lum * t),
                        int(g * (1 - t) + BEIGE[1] * lum * t),
                        int(b * (1 - t) + BEIGE[2] * lum * t))
    return im


def add_shadow(im):
    w, h = im.size; px = im.load()

    def is_obj(x, y):
        r, g, b = px[x, y]
        return abs(r - BEIGE[0]) + abs(g - BEIGE[1]) + abs(b - BEIGE[2]) > 120

    lowest = -1
    for y in range(h - 1, -1, -1):
        if any(is_obj(x, y) for x in range(0, w, 3)):
            lowest = y; break
    if lowest < 0:
        return im
    xs = [x for y in range(max(0, lowest - int(h * 0.04)), lowest + 1)
          for x in range(0, w, 2) if is_obj(x, y)]
    if not xs:
        return im
    x0, x1 = min(xs), max(xs); cx = (x0 + x1) // 2
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


def main():
    done = fouten = 0
    cursor = None
    while True:
        d = gql("""query($c: String) {
          products(first: 25, after: $c, query: "vendor:SteraPro -tag:%s") {
            pageInfo { hasNextPage endCursor }
            nodes { id title
              media(first: 5) { nodes { id ... on MediaImage { image { url } } } } } } }""" % TAG,
            {"c": cursor})
        prods = d["data"]["products"]["nodes"]
        page = d["data"]["products"]["pageInfo"]
        if not prods:
            break
        for p in prods:
            try:
                imgs = [m for m in p["media"]["nodes"] if m.get("image")]
                if not imgs:
                    gql('mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }',
                        {"id": p["id"], "tags": [TAG, "geen-foto"]})
                    continue
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
                done += 1
                os.unlink(raw); os.unlink(out)
            except Exception as e:
                fouten += 1
                print(f"FOUT {p['title']}: {e}", flush=True)
            time.sleep(0.4)
            if (done + fouten) % 10 == 0:
                print(f"voortgang: {done} ok / {fouten} fout", flush=True)
        if not page["hasNextPage"]:
            cursor = None
        else:
            cursor = page["endCursor"]
        # query filtert op -tag, dus altijd vanaf begin pagineren
        if not page["hasNextPage"] and not prods:
            break
        cursor = None
        if not prods:
            break
    print(f"KLAAR: {done} ok, {fouten} fout", flush=True)


if __name__ == "__main__":
    main()
