-- has_image-vlag op nieuwkoop_products.
--
-- Het check-image-availability.mjs-script doet één GET per item naar
-- de leverancier-image-endpoint en zet has_image op true/false
-- (en image_checked_at op het tijdstip van de check). Catalogus en
-- offerte-auto-suggest filteren items met has_image = false eruit,
-- zodat we geen placeholder-kaartjes meer tonen.
--
-- Idempotente migration — mag opnieuw uitgevoerd worden.
alter table public.nieuwkoop_products
  add column if not exists has_image boolean;

alter table public.nieuwkoop_products
  add column if not exists image_checked_at timestamptz;
