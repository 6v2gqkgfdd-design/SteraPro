# Migraties

## `shopify_stock_state`

`20261009120000_shopify_stock_state.sql` maakt `shopify_stock_state` en `stock_sync_reports`. Het script is idempotent (`create table if not exists`, `drop policy if exists`).

Niet toepassen op productie vanuit deze PR. De voorraad-sync blijft een dry-run zolang `SHOPIFY_INVENTORY_SYNC_LIVE` niet op `1` staat. Zonder deze tabel crasht een dry-run niet: er komt een waarschuwing, `zero_since` start op vandaag, en `restored` blijft 0.

Toepassen, pas na een expliciete go, alleen dit bestand in de Supabase SQL-editor plakken en uitvoeren. Geen `supabase db push` als dat ook andere openstaande migraties zou meenemen. Daarna één read-only dry-run:

```bash
node --experimental-strip-types --env-file=.env.local scripts/stock-sync-dry-run.mjs
```

Het JSON-rapport moet `"writes": false` en `"dry_run": true` tonen. `state_table` wordt `true` zodra de tabel er is.
