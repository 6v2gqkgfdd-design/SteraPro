# Foto-optimalisatie via terminal

Volledige batch **zonder de admin-UI of chat**. Wel nodig: `XAI_API_KEY` (Grok Imagine API).

## Wat er gebeurt

Voor elk **aangeboden** product dat nog **niet afgewerkt** is:

1. Nieuwkoop cutout ophalen  
2. Beige studio-basis (sharp)  
3. **Grok Imagine** studiofoto  
4. Detail (blad-crop) + maatfoto (H/Ø)  
5. Opslaan in Storage: `studio/`, `detail/`, `maat/` + `product_enrichment`

Catalogus-thumbnail = studio. Origineel NK blijft beschikbaar.

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
