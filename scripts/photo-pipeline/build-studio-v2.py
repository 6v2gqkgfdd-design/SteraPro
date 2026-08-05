# Studio-foto v2 — bouwt de referentie-look (warme perzik-beige studio-sweep)
# uit de echte Nieuwkoop-cutout. Product blijft 100% ongewijzigd.
# Gebruik: python3 build-studio-v2.py <cutout.png> <uit.png>
import sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

SIZE = 1024
# Referentiekleuren (gesampled uit doelbeeld)
WALL_TOP    = (239, 211, 176)
WALL_MID    = (246, 222, 189)   # lichtste punt, ~50% hoogte
FLOOR_BOT   = (236, 206, 170)   # subtielere wand->vloer overgang
VIGNETTE    = 0.955             # hoek-donkerte factor (subtiel)
SHADOW_RGB  = (120, 88, 58)

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def lerp(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))

def build_background():
    bg = Image.new('RGB', (SIZE, SIZE))
    px = bg.load()
    for y in range(SIZE):
        fy = y / SIZE
        if fy < 0.50:
            col = lerp(WALL_TOP, WALL_MID, smoothstep(0.0, 0.50, fy))
        else:
            col = lerp(WALL_MID, FLOOR_BOT, smoothstep(0.50, 1.05, fy))
        for x in range(SIZE):
            fx = x / SIZE
            # subtiele radiale vignette rond (0.5, 0.55)
            d = math.hypot(fx - 0.5, (fy - 0.55) * 0.9)
            v = 1.0 - (1.0 - VIGNETTE) * smoothstep(0.50, 0.95, d)
            px[x, y] = tuple(int(c * v) for c in col)
    return bg

def pot_metrics(cut):
    """Zoek pot-onderkant en potbreedte uit het alfakanaal."""
    a = cut.split()[-1]
    bbox = cut.getbbox()
    l, t, r, b = bbox
    w, h = a.size
    # onderste 4% van de plant-bbox = potvoet
    y0 = max(t, b - max(4, int((b - t) * 0.04)))
    xs = []
    for y in range(y0, b):
        row = [x for x in range(l, r) if a.getpixel((x, y)) > 40]
        if row:
            xs.append((min(row), max(row)))
    if not xs:
        return bbox, (l + r) // 2, (r - l) // 3
    xmin = min(p[0] for p in xs); xmax = max(p[1] for p in xs)
    return bbox, (xmin + xmax) // 2, (xmax - xmin)

def add_shadow(bg, cx, base_y, pot_w, cut=None, paste_x=0):
    """Zachte schaduw: geprojecteerd silhouet van de hele plant + contactschaduw."""
    # 1. Plant-silhouet plat op de vloer projecteren (zeer zacht)
    if cut is not None:
        a = cut.split()[-1]
        sil_h = max(30, int(cut.height * 0.22))
        sil = a.resize((cut.width, sil_h)).transpose(Image.FLIP_TOP_BOTTOM)
        sil = sil.point(lambda v: int(v * 0.28))
        layer = Image.new('L', (SIZE, SIZE), 0)
        layer.paste(sil, (paste_x + 18, base_y - sil_h // 4))
        layer = layer.filter(ImageFilter.GaussianBlur(34))
        shade = Image.new('RGB', (SIZE, SIZE), SHADOW_RGB)
        bg.paste(shade, (0, 0), layer)
    # 2. Zachte contactschaduw onder de pot
    layer = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(layer)
    ew = int(pot_w * 1.5); eh = max(14, int(ew * 0.18))
    d.ellipse((cx - ew // 2, base_y + 6 - eh // 2,
               cx + ew // 2, base_y + 6 + eh // 2), fill=110)
    layer = layer.filter(ImageFilter.GaussianBlur(26))
    shade = Image.new('RGB', (SIZE, SIZE), SHADOW_RGB)
    bg.paste(shade, (0, 0), layer)
    return bg

def grade(cut):
    """Subtiele kleur-upgrade: rijker, iets meer contrast. Plant blijft echt."""
    rgb = cut.convert('RGB')
    rgb = ImageEnhance.Color(rgb).enhance(1.04)   # mild: potkleur moet exact blijven
    rgb = ImageEnhance.Contrast(rgb).enhance(1.03)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=3))
    out = rgb.convert('RGBA')
    out.putalpha(cut.split()[-1])
    return out

def pot_top_row(cut, pot_w):
    """Potrand = waar het silhouet van onderaf plots versmalt naar stengels,
    of (bij bossige planten) plots verbreedt naar blad. Fallback: None."""
    a = cut.split()[-1]
    w, h = a.size
    px = a.load()
    run_max, top = 0, h - 1
    min_w, min_y = None, None
    for y in range(h - 1, int(h * 0.20), -1):
        xs = [x for x in range(w) if px[x, y] > 40]
        if not xs:
            continue
        breedte = max(xs) - min(xs)
        if run_max > pot_w * 0.9:
            if breedte < run_max * 0.40:              # stengels boven de potrand
                return y
            if breedte < run_max * 0.92:              # dalende flank voorbij de buik
                if min_w is None or breedte < min_w:
                    min_w, min_y = breedte, y
            if min_w is not None and breedte > min_w * 1.30:
                return min_y                          # blad zet uit: rand = taille
        run_max = max(run_max, breedte)
        top = y
    return None

def main(src, dst, plant_frac=0.78, base_frac=0.875):
    cut = Image.open(src).convert('RGBA')
    bbox = cut.getbbox()
    cut = cut.crop(bbox)
    cut = grade(cut)
    # schaal naar plant_frac van canvashoogte
    target_h = int(SIZE * plant_frac)
    scale = target_h / cut.height
    cut = cut.resize((int(cut.width * scale), target_h), Image.LANCZOS)
    _, pcx, pot_w = pot_metrics(cut)
    base_y = int(SIZE * base_frac)
    paste_x = SIZE // 2 - pcx
    paste_y = base_y - cut.height
    bg = build_background()
    bg = add_shadow(bg, SIZE // 2, base_y - 6, pot_w, cut=cut, paste_x=paste_x)
    # kale achtergrond (mét schaduw, zónder plant) + plantmasker:
    # nodig om na de AI-render de achtergrond overal identiek te maken
    bg.save(dst.replace('.png', '') + '.bg.png')
    pm = Image.new('L', (SIZE, SIZE), 0)
    pm.paste(cut.split()[-1], (paste_x, paste_y))
    pm.save(dst.replace('.png', '') + '.plantmask.png')
    bg.paste(cut, (paste_x, paste_y), cut)
    bg.save(dst, 'PNG')
    # meta voor de maatfoto: waar zit de pot écht in beeld
    import json as _json
    pt = pot_top_row(cut, pot_w)
    meta = {'base_frac': base_frac, 'pot_w_frac': pot_w / SIZE}
    if pt is not None:
        frac = (paste_y + pt) / SIZE
        pothoogte = base_frac - frac
        if 0.06 < pothoogte < 0.55:           # sanity: anders fallback op cm-berekening
            meta['pot_top_frac'] = frac
    open(dst.replace('.png', '') + '.meta.json', 'w').write(_json.dumps(meta))
    # pot-masker: om de originele pot ná AI-hertekening exact terug te zetten
    if pt is not None and 'pot_top_frac' in meta:
        a = cut.split()[-1].copy()
        adr = ImageDraw.Draw(a)
        adr.rectangle((0, 0, cut.width, max(0, pt - 4)), fill=0)   # alles boven de potrand weg
        mask = Image.new('L', (SIZE, SIZE), 0)
        mask.paste(a, (paste_x, paste_y))
        mask = mask.filter(ImageFilter.GaussianBlur(3))
        mask.save(dst.replace('.png', '') + '.mask.png')
    # detail-basis: crop van de échte bladmassa (voor AI-verscherping, niet -herinterpretatie)
    top_y = base_y - cut.height
    onderkant = int(SIZE * meta.get('pot_top_frac', base_frac - 0.2))
    zijde = min(int(SIZE * 0.55), max(200, onderkant - top_y))
    y0 = max(0, top_y + int(0.04 * SIZE))
    x0 = SIZE // 2 - zijde // 2
    det = bg.crop((x0, y0, x0 + zijde, y0 + zijde)).resize((1024, 1024), Image.LANCZOS)
    det.save(dst.replace('.png', '') + '.detailbasis.png')
    print('OK ->', dst, 'potbreedte', pot_w, 'pottop',
          round(meta['pot_top_frac'], 3) if 'pot_top_frac' in meta else 'fallback-cm')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
