# Maakt uit de AI-studiofoto de definitieve set in hoge kwaliteit (2048px):
#   studio-final  (opgeschaald + verscherpt)
#   detail        (strakke crop op de bladmassa)
#   maat          (totale hoogte + pothoogte + Ø, zachte salie-lijnen)
# Gebruik: python3 maak-fotoset.py <ai-foto.png> <itemcode> [outdir]
import sys, json, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SAGE = (122, 138, 110, 235)     # zachte salie-groen, licht transparant
DOEL = 2048                     # afleverresolutie
BASE_FRAC, PLANT_FRAC = 0.875, 0.78   # compositie uit build-studio-v2.py

def font(size):
    for p in ("/System/Library/Fonts/Avenir Next.ttc",
              "/System/Library/Fonts/HelveticaNeue.ttc",
              "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()

ESRGAN = os.path.join(os.path.dirname(__file__), 'realesrgan', 'realesrgan-ncnn-vulkan')

def opschalen(src_pad, werkdir):
    """4x Real-ESRGAN (getrouwe super-resolutie) -> 4096px master."""
    import subprocess, tempfile
    master = os.path.join(werkdir, '_master-' + os.path.basename(src_pad))
    if os.path.exists(ESRGAN):
        subprocess.run([ESRGAN, '-i', os.path.abspath(src_pad),
                        '-o', os.path.abspath(master),
                        '-n', 'realesrgan-x4plus', '-s', '4',
                        '-m', os.path.join(os.path.dirname(ESRGAN), 'models')],
                       check=True, capture_output=True)
        return Image.open(master).convert('RGB')
    im = Image.open(src_pad).convert('RGB').resize((DOEL, DOEL), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=68, threshold=2))

def detailfoto(hq, code, outdir, dst):
    """Eerlijke uitsnede van de bladmassa uit de AI-studiofoto zelf (geen extra AI)."""
    S = hq.width
    meta = {}
    mp = os.path.join(outdir, f'studio-{code}.meta.json')
    if os.path.exists(mp):
        meta = json.load(open(mp))
    top = int(S * (meta.get('base_frac', BASE_FRAC) - PLANT_FRAC))
    onder = int(S * meta.get('pot_top_frac', meta.get('base_frac', BASE_FRAC) - 0.25))
    zijde = min(int(S * 0.50), max(int(S * 0.3), onder - top))
    y0 = max(0, top + (onder - top - zijde) // 2)
    x0 = S // 2 - zijde // 2
    crop = hq.crop((x0, y0, x0 + zijde, y0 + zijde)).resize((DOEL, DOEL), Image.LANCZOS)
    crop = crop.filter(ImageFilter.UnsharpMask(radius=1.8, percent=52, threshold=2))
    crop.save(dst, 'PNG')

def _maatlijn_v(d, x, y0, y1, w):
    d.line((x, y0, x, y1), fill=SAGE, width=w)
    for yy in (y0, y1):
        d.line((x - 5 * w, yy, x + 5 * w, yy), fill=SAGE, width=w)

def maatfoto(hq, itemcode, dst):
    m = json.load(open(os.path.join(os.path.dirname(__file__),
                                    'maten-by-itemcode.json'))).get(itemcode)
    im = hq.convert('RGBA')
    if not m:
        im.convert('RGB').save(dst, 'PNG')
        print('  ! geen maten voor', itemcode)
        return
    S = im.width
    laag = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(laag)
    f = font(int(S * 0.020))
    lw = max(3, S // 512)
    # compositie-meta van build-studio-v2 (waar de pot écht zit)
    meta = {}
    mp = os.path.join(os.path.dirname(dst), f'studio-{itemcode}.meta.json')
    if os.path.exists(mp):
        meta = json.load(open(mp))
    base_y = int(S * meta.get('base_frac', BASE_FRAC))
    top_y = base_y - int(S * PLANT_FRAC)
    cm_px = (S * PLANT_FRAC) / m['total']          # pixels per cm

    # totale hoogte — rechts
    x = int(S * 0.915)
    _maatlijn_v(d, x, base_y, top_y, lw)
    lbl = f"{int(round(m['total']))} cm"
    d.text((x - d.textlength(lbl, font=f) - int(S * 0.018),
            (base_y + top_y) // 2 - int(S * 0.018)), lbl, fill=SAGE, font=f)

    # pothoogte — links, uitgelijnd op de pot zoals die in beeld staat
    if m.get('pot'):
        xp = int(S * 0.085)
        pot_top = int(S * meta['pot_top_frac']) if meta.get('pot_top_frac') \
            else base_y - int(m['pot'] * cm_px)
        _maatlijn_v(d, xp, base_y, pot_top, lw)
        lbl = f"{int(round(m['pot']))} cm"
        d.text((xp + int(S * 0.015), (base_y + pot_top) // 2 - int(S * 0.012)),
               lbl, fill=SAGE, font=f)

    # breedte-maat onder de pot: Ø (rond) of L × B (rechthoekig), label ónder de lijn
    onderlbl, onder_cm = None, None
    if m.get('diam'):
        onderlbl, onder_cm = f"Ø {int(round(m['diam']))} cm", m['diam']
    elif m.get('l'):
        onder_cm = m['l']
        onderlbl = (f"{int(round(m['l']))} × {int(round(m['b']))} cm"
                    if m.get('b') else f"{int(round(m['l']))} cm")
    if onderlbl:
        yb = int(S * 0.952)
        half = int(onder_cm * cm_px / 2)
        d.line((S // 2 - half, yb, S // 2 + half, yb), fill=SAGE, width=lw)
        for xx in (S // 2 - half, S // 2 + half):
            d.line((xx, yb - 5 * lw, xx, yb + 5 * lw), fill=SAGE, width=lw)
        d.text((S // 2 - d.textlength(onderlbl, font=f) / 2, yb + int(S * 0.010)),
               onderlbl, fill=SAGE, font=f)

    Image.alpha_composite(im, laag).convert('RGB').save(dst, 'PNG')

def achtergrond_gelijktrekken(ai_pad, code, outdir):
    """Verzacht enkel de wand/vloer-lijn: verticale gladstrijking in de horizonband,
    buiten de plant- en schaduwzone. AI-belichting en sfeer blijven behouden."""
    ai = Image.open(ai_pad).convert('RGB')
    S = ai.size[0]
    # sterk verticaal gladgestreken variant (horizontaal blijft intact)
    glad = ai.resize((S, max(8, S // 24)), Image.BILINEAR).resize((S, S), Image.BILINEAR)
    # bandmasker rond de horizon (0.68–0.97 van de hoogte) met zachte randen
    band = Image.new('L', ai.size, 0)
    db = ImageDraw.Draw(band)
    db.rectangle((0, int(S * 0.72), S, int(S * 0.93)), fill=255)
    band = band.filter(ImageFilter.GaussianBlur(S * 0.035))
    # plant + schaduwzone uitsluiten
    pm_p = os.path.join(outdir, f'studio-{code}.plantmask.png')
    if os.path.exists(pm_p):
        pm = Image.open(pm_p).convert('L').resize(ai.size, Image.NEAREST)
        pm = pm.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(S * 0.05))
        pm = pm.point(lambda v: min(255, int(v * 2.0)))
        from PIL import ImageChops
        band = ImageChops.subtract(band, pm)
    out = Image.composite(glad, ai, band)
    tmp = os.path.join(outdir, f'_norm-{code}.png')
    out.save(tmp, 'PNG')
    return tmp

def pot_terugzetten(ai_im, code, outdir):
    """Originele pot uit de basis exact terug over de AI-foto (kleur/textuur 100% origineel)."""
    basis_p = os.path.join(outdir, f'studio-{code}.png')
    mask_p = os.path.join(outdir, f'studio-{code}.mask.png')
    if not (os.path.exists(basis_p) and os.path.exists(mask_p)):
        return ai_im
    basis = Image.open(basis_p).convert('RGB').resize(ai_im.size, Image.LANCZOS)
    mask = Image.open(mask_p).convert('L').resize(ai_im.size, Image.LANCZOS)
    return Image.composite(basis, ai_im, mask)

if __name__ == '__main__':
    # gebruik: maak-fotoset.py <ai-studio.png> <itemcode> [outdir]
    src, code = sys.argv[1], sys.argv[2]
    outdir = sys.argv[3] if len(sys.argv) > 3 else '.'
    src = achtergrond_gelijktrekken(src, code, outdir)  # achtergrond overal identiek
    master = opschalen(src, outdir)                     # 4096 via Real-ESRGAN
    studio = master.resize((DOEL, DOEL), Image.LANCZOS)
    studio.save(os.path.join(outdir, f'studio-final-{code}.png'), 'PNG')
    detailfoto(master, code, outdir, os.path.join(outdir, f'detail-{code}.png'))
    maatfoto(studio, code, os.path.join(outdir, f'maat-{code}.png'))
    print('OK -> studio-final + detail + maat voor', code)
