-- Cache voor AI-gegenereerde productbeschrijvingen (plant + pot + verzorgingstips).
-- Sleutel = productnaam (description), zelfde niveau als de Shopify-sync.
-- Eén keer genereren, daarna hergebruiken; de sync vult dit aan voor aangeboden
-- producten. Beheerd door de server (service-role); enkel beheerders mogen lezen.

create table if not exists public.shopify_product_descriptions (
  group_name   text primary key,
  body_html    text,
  generated_at timestamptz not null default now()
);

alter table public.shopify_product_descriptions enable row level security;

drop policy if exists "staff_manage" on public.shopify_product_descriptions;
create policy "staff_manage" on public.shopify_product_descriptions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());
