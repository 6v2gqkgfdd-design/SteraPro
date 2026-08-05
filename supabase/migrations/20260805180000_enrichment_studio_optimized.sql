-- Studiofoto + workflow "afgewerkt" op product_enrichment
-- Originele Nieuwkoop-foto blijft in bucket nieuwkoop-images/{itemcode}.jpg
-- Studio (optioneel): nieuwkoop-images/studio/{itemcode}.jpg (of .png)

alter table public.product_enrichment
  add column if not exists studio_image_path text;

alter table public.product_enrichment
  add column if not exists optimized boolean not null default false;

comment on column public.product_enrichment.studio_image_path is
  'Pad in storage-bucket nieuwkoop-images, bv. studio/CC0060777.jpg. Null = nog geen studiofoto.';

comment on column public.product_enrichment.optimized is
  'Product is afgewerkt/geoptimaliseerd (foto + data) en klaar voor webshop-push.';

comment on column public.product_enrichment.ready_for_shopify is
  'Alias-workflow: mag naar Shopify. Wordt synchroon gehouden met optimized in de app.';

create index if not exists product_enrichment_optimized_idx
  on public.product_enrichment (optimized)
  where optimized = true;

create index if not exists product_enrichment_studio_idx
  on public.product_enrichment (studio_image_path)
  where studio_image_path is not null;
