# Foto-optimalisatie via terminal

**Zelfde look als de combinatie-pipeline** (niet de simpele sharp-beige).

## Pipeline (identiek aan combis)

1. Nieuwkoop cutout  
2. **`build-studio-v2.py`** — warme perzik-beige studio, plant 100% echt  
3. **Grok Imagine** — zelfde prompt als `pipeline-fotos.mjs`  
4. **`maak-fotoset.py`** — studio-final + detail + maat (2048px)  
5. **Full-res PNG → NAS** (`/Volumes/Documenten-Jellie/SteraPro/photos/generated/by-itemcode/{code}/`)  
6. Web-JPEG → Supabase Storage + `product_enrichment`

### NAS-archief

- Standaardroot: `/Volumes/Documenten-Jellie/SteraPro`  
- Override: `STERAPRO_NAS_ROOT=...` in `.env.local`  
- NAS moet gemount zijn (share **Documenten-Jellie**). Zonder mount gaat de pipeline gewoon door; alleen cloud-JPEG wordt geschreven.  
- Layout: zie `README.txt` op de NAS.

Vereist lokaal: **python3 + Pillow**, `XAI_API_KEY`, Nieuwkoop + Supabase env.

## Commando’s

```bash
cd ~/stera-pro-batch/SteraPro   # of je clone-pad

# Dry-run: toon wat er zou gebeuren
npm run optimize-photos:dry

# Eerste 5 testen
node --env-file=.env.local scripts/optimize-offered-photos.mjs --limit=5

# Alles openstaand (aangeboden, niet optimized)
npm run optimize-photos

# Zelfde + meteen "Afgewerkt" zetten
npm run optimize-photos:mark

# Specifieke itemcodes
node --env-file=.env.local scripts/optimize-offered-photos.mjs CC0060777 CC0066028

# Ook al-geoptimaliseerde opnieuw
node --env-file=.env.local scripts/optimize-offered-photos.mjs --force --limit=3
```

## Env (`.env.local`)

```
XAI_API_KEY=
NIEUWKOOP_API_BASE_URL=
NIEUWKOOP_API_USER=
NIEUWKOOP_API_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# optioneel:
AI_MODEL=grok-imagine-image-quality
AI_RESOLUTION=1k
```

## Tips

- Hervatbaar: opnieuw draaien slaat items over die al `optimized=true` hebben (tenzij `--force`).  
- Zonder `--mark-optimized` moet je in de UI nog “Afgewerkt” bevestigen.  
- Shopify-sync is apart: eerst selectie + fotoset, dan “Sync naar Shopify”.  
