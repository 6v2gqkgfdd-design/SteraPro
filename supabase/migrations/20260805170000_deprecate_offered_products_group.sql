-- Legacy group-level webshop-selectie is afgeschaft.
-- Enige bron van waarheid: public.shopify_offered_items (itemcode).
-- Tabel shopify_offered_products blijft bestaan als archief (geen app-code meer);
-- mag later gedropt worden na bevestiging.

comment on table public.shopify_offered_products is
  'DEPRECATED (2026-08): group-level selectie. Gebruik shopify_offered_items. Niet meer gelezen door sync/app.';
