-- =====================================================================
-- Stera product-verrijking (naast ruwe Nieuwkoop-data)
-- Locatie, ready-flag, notities — nooit overschrijven van nieuwkoop_products
-- =====================================================================

create table if not exists public.product_enrichment (
  itemcode            text primary key
                        references public.nieuwkoop_products(itemcode) on delete cascade,
  -- Handmatige locatie (null = niet gezet; NK blijft primair als die er is)
  location_binnen     boolean,
  location_buiten     boolean,
  location_source     text check (
                        location_source is null
                        or location_source in ('manual', 'rule')
                      ),
  -- Workflow: klaar om naar Shopify te pushen
  ready_for_shopify   boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists product_enrichment_ready_idx
  on public.product_enrichment (ready_for_shopify)
  where ready_for_shopify = true;

create index if not exists product_enrichment_loc_idx
  on public.product_enrichment (location_binnen, location_buiten);

alter table public.product_enrichment enable row level security;

drop policy if exists "staff_manage_product_enrichment" on public.product_enrichment;
create policy "staff_manage_product_enrichment" on public.product_enrichment
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop trigger if exists trg_product_enrichment_updated on public.product_enrichment;
create trigger trg_product_enrichment_updated
  before update on public.product_enrichment
  for each row execute function public.set_updated_at();

comment on table public.product_enrichment is
  'Stera-verrijking bovenop Nieuwkoop: locatie, ready-flag, notities. Ruwe NK-data blijft onaangeroerd.';

-- Helper: parseert Location-tag uit tags jsonb → array ['Binnen','Buiten']
create or replace function public.nk_location_from_tags(p_tags jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(distinct v order by v),
    '{}'::text[]
  )
  from (
    select trim(val->>'Description_NL') as v
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) t
    cross join lateral jsonb_array_elements(coalesce(t->'Values', '[]'::jsonb)) val
    where t->>'Code' = 'Location'
      and trim(coalesce(val->>'Description_NL', '')) in ('Binnen', 'Buiten')
  ) x
  where v is not null;
$$;

comment on function public.nk_location_from_tags is
  'Haalt Binnen/Buiten uit Nieuwkoop tags (Code=Location, Description_NL).';
