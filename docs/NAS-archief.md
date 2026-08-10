# SteraPro NAS-archief

## Doel

Full-res foto’s en backups blijven **van jou** op de NAS.  
De live app/webshop gebruikt lichte web-JPEG’s in Supabase.

## Pad

| | |
|--|--|
| Share | `Documenten-Jellie` op Nastasia |
| Map | `/Volumes/Documenten-Jellie/SteraPro` |
| Env | `STERAPRO_NAS_ROOT` (optioneel) |

## Structuur

```
SteraPro/
├── photos/
│   ├── originals/{itemcode}/
│   ├── generated/by-itemcode/{itemcode}/
│   │   ├── studio.png
│   │   ├── detail.png
│   │   ├── maat.png
│   │   └── meta.json
│   └── thumbs/
├── catalog/exports/
├── backups/supabase/
├── backups/shopify/
└── docs/
```

## Wanneer wordt er geschreven?

| Context | Full-res → NAS | Web-JPEG → Supabase |
|---------|----------------|---------------------|
| `npm run optimize-photos` (Mac + NAS) | ja | ja |
| Catalogus-knop op Vercel | nee (geen NAS) | ja |
| Zonder NAS gemount | overgeslagen | ja |

## Code

- `lib/nas-archive.ts` — helpers (`archivePhotosetToNas`, backups, exports)
- `scripts/optimize-offered-photos.mjs` — batch pipeline
- `lib/photo-pipeline.ts` — Vercel/API pipeline (NAS alleen lokaal)

## Tips

1. Houd **Documenten-Jellie** gemount als je batches draait.  
2. Full-res PNG’s niet in Shopify zetten — te zwaar.  
3. Later: periodieke Supabase DB-dump → `backups/supabase/`.
