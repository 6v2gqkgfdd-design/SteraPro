# SteraPro webshop-assortimenten

*Opgesteld augustus 2026 — commercieel B2B-kantoorplantenassortiment.*

## Onderbouwing

Wat in commerciële interieurs en plant hire structureel verkoopt:

| Trend | Bron |
|--------|------|
| **Low-maintenance kantoorplanten** (Sansevieria, ZZ, Aglaonema, Pothos, Dracaena) | Industry guides Ambious / Foliage Design / facility plant hire |
| **Statement bij receptie** (Ficus, Strelitzia, Monstera, hoge Dracaena) | Standaard in hospitality & corporate lobbies |
| **Palmen** (Kentia, Areca, Rhapis, Chamaedorea) | Tijdloze Belgische/NL kantoor-klassiekers |
| **Hangplanten** | Weinig footprint, veel volume op rekken/kasten |
| **Designbladeren** | Hogere marge-look voor designkantoren & showrooms |

Selectiecriteria in onze catalogus: **voorraad ≥ 3**, geen multi-trays, diversiteit per soort, max ~12 SKUs per collectie → **60 aangeboden itemcodes** → **39 Shopify-producten** (varianten samengevoegd).

## De 5 collecties

### 1. Kantoorhelden  
**Handle:** `kantoorhelden`  
**Pitch:** Onverwoestbare basis — weinig licht, vergeefzaam water, strak professioneel.  
**Soorten:** Sansevieria (Laurentii, zeylanica, cylindrica), Zamioculcas, Aglaonema, Spathiphyllum, Aspidistra.  
**Waarom:** Meest gevraagde contractplanten; lage uitval in onderhoud.

### 2. Receptie & statement  
**Handle:** `receptie-statement`  
**Pitch:** Hoogte en allure bij inkom, liftlobby, boardroom.  
**Soorten:** Ficus elastica / lyrata / Audrey, Dracaena fragrans, Beaucarnea, Strelitzia, Monstera deliciosa.  
**Waarom:** Eén sterke plant verkoopt de hele “groene aankomst”-ervaring.

### 3. Palmen voor de workspace  
**Handle:** `palmen-workspace`  
**Pitch:** Zachte tropische sfeer, luchtig blad, matig licht.  
**Soorten:** Rhapis excelsa, Dypsis (Areca), Chamaedorea, Livistona, Caryota, Phoenix roebelenii.  
**Waarom:** Evergreen B2B-favoriet; goed schaalbaar in contracten.

### 4. Hang & cascade  
**Handle:** `hang-cascade`  
**Pitch:** Volume zonder vloeroppervlak — planken, kasten, scheidingswanden.  
**Soorten:** Philodendron scandens/Brasil, Scindapsus/Epipremnum (Aureum, pictus).  
**Waarom:** Snel “voller” kantoor; makkelijk te vervangen.

### 5. Designbladeren  
**Handle:** `designbladeren`  
**Pitch:** Patroon en textuur voor designkantoren en showrooms.  
**Soorten:** Calathea, Monstera, Alocasia e.a.  
**Waarom:** Hogere perceived value; combineer met Kantoorhelden als basis.

## Shopify

| Collectie | URL-pad (storefront) |
|-----------|----------------------|
| Kantoorhelden | `/collections/kantoorhelden` |
| Receptie & statement | `/collections/receptie-statement` |
| Palmen voor de workspace | `/collections/palmen-workspace` |
| Hang & cascade | `/collections/hang-cascade` |
| Designbladeren | `/collections/designbladeren` |

Elke collectie heeft:
- NL titel + HTML-omschrijving (commercieel)
- Coverbeeld (gegenereerd, geüpload)
- Producten gekoppeld (via SKU na product-sync)

## Catalogus (app)

- Tabel `shopify_offered_items` → `offered = true` voor 60 itemcodes  
- Zichtbaar onder **Aangeboden** in `/admin/catalogus`

## Scripts

```bash
# Selectie + offered + collecties
node --env-file=.env.local scripts/build-webshop-assortments.mjs --live

# Producten naar Shopify
node --env-file=.env.local sync-shopify-products.mjs --full --live

# Covers + herkoppelen
node --env-file=.env.local scripts/upload-collection-covers.mjs --live
```

Rapport: `scripts/webshop-assortments-report.json`  
Covers: `assets/collection-covers/`

## Volgende stappen (optioneel)

1. Menu in Shopify-thema: link de 5 collecties  
2. Homepage-secties per collectie  
3. Studiofoto’s genereren voor items zonder fotoset (meer conversie)  
4. Uitbreiden met potten/combinaties (CC-codes) per collectie  
