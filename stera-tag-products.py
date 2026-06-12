#!/usr/bin/env python3
"""
Situatie-tags voor de webshop, berekend uit de Nieuwkoop-data in Supabase.

Per product (via de variant-SKU's = Nieuwkoop-itemcodes):
  - Lichtbehoefte:  "Veel licht" / "Gemiddeld licht" / "Weinig licht"
  - Hoogteklasse:   "Compact (tot 60 cm)" / "Middelgroot (60-120 cm)" /
                    "Groot (120-180 cm)" / "Extra groot (180+ cm)"
  - "Hydrocultuur"  als een variant hydro is
  - "Ook voor buiten" als Nieuwkoop de plant buiten-geschikt tagt

Idempotent: tagsAdd voegt enkel toe. Draaien met de Pillow/numpy-venv of
gewone python3 (geen beeldverwerking nodig):
    /tmp/venv/bin/python stera-tag-products.py
Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
     NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import json, os, re, subprocess, time
from concurrent.futures import ThreadPoolExecutor

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-04/graphql.json"
SUPA = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPA_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def token():
    body = (f"grant_type=client_credentials&client_id={os.environ['SHOPIFY_CLIENT_ID']}"
            f"&client_secret={os.environ['SHOPIFY_CLIENT_SECRET']}")
    r = subprocess.run(["curl", "-s", f"https://{SHOP}/admin/oauth/access_token",
                        "-H", "Content-Type: application/x-www-form-urlencoded", "-d", body],
                       capture_output=True, text=True)
    return json.loads(r.stdout)["access_token"]


TOK = token()


def gql(q, v=None):
    p = json.dumps({"query": q, "variables": v or {}})
    for _ in range(4):
        r = subprocess.run(["curl", "-s", "--max-time", "60", API,
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
    raise RuntimeError("gql faalt")


def supa_all(path):
    rows, off = [], 0
    while True:
        r = subprocess.run(["curl", "-s", f"{SUPA}/rest/v1/{path}&limit=1000&offset={off}",
                            "-H", f"apikey: {SUPA_KEY}", "-H", f"Authorization: Bearer {SUPA_KEY}"],
                           capture_output=True, text=True)
        b = json.loads(r.stdout)
        rows += b
        if len(b) < 1000:
            return rows
        off += 1000


def tagval(tags, code):
    if not isinstance(tags, list):
        return []
    for t in tags:
        if t.get("Code") == code:
            return [(v.get("Description_NL") or "") for v in (t.get("Values") or [])]
    return []


print("Nieuwkoop-data laden uit Supabase...")
nk = supa_all("nieuwkoop_products?select=itemcode,height,item_variety_nl,tags&product_group_code=eq.275")
info = {}
for it in nk:
    lux_vals = [int(re.sub(r"[^0-9]", "", v) or 0) for v in tagval(it.get("tags"), "LocationLight") if v]
    info[it["itemcode"]] = {
        "h": it.get("height") or 0,
        "lux": max(lux_vals) if lux_vals else None,
        "hydro": bool(re.search(r"hydro", it.get("item_variety_nl") or "", re.I)),
        "buiten": "Buiten" in tagval(it.get("tags"), "Location"),
    }
print(f"  {len(info)} itemcodes geladen")


def hoogte_tag(h):
    if h <= 0: return None
    if h < 60: return "Compact (tot 60 cm)"
    if h < 120: return "Middelgroot (60-120 cm)"
    if h < 180: return "Groot (120-180 cm)"
    return "Extra groot (180+ cm)"


def licht_tag(lux):
    if lux is None: return None
    if lux >= 1000: return "Veel licht"
    if lux >= 500: return "Gemiddeld licht"
    return "Weinig licht"


stats = {"done": 0, "skip": 0}


def process(p):
    skus = [v["sku"] for v in p["variants"]["nodes"] if v.get("sku")]
    datas = [info[s] for s in skus if s in info]
    if not datas:
        stats["skip"] += 1
        return
    tags = set()
    luxes = [d["lux"] for d in datas if d["lux"] is not None]
    t = licht_tag(min(luxes)) if luxes else None
    if t: tags.add(t)
    for d in datas:
        ht = hoogte_tag(d["h"])
        if ht: tags.add(ht)
    if any(d["hydro"] for d in datas): tags.add("Hydrocultuur")
    if all(d["buiten"] for d in datas): tags.add("Ook voor buiten")
    if not tags:
        stats["skip"] += 1
        return
    gql('mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }',
        {"id": p["id"], "tags": sorted(tags)})
    stats["done"] += 1
    if stats["done"] % 50 == 0:
        print(f"voortgang: {stats['done']} getagd", flush=True)


cursor = None
all_prods = []
while True:
    d = gql("""query($c: String) { products(first: 100, after: $c, query: "vendor:SteraPro") {
        pageInfo { hasNextPage endCursor }
        nodes { id variants(first: 50) { nodes { sku } } } } }""", {"c": cursor})
    pr = d["data"]["products"]
    all_prods += pr["nodes"]
    if not pr["pageInfo"]["hasNextPage"]:
        break
    cursor = pr["pageInfo"]["endCursor"]
print(f"{len(all_prods)} producten opgehaald")
with ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(process, all_prods))
print(f"KLAAR: {stats['done']} getagd, {stats['skip']} overgeslagen")
