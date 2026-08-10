-- Bestellingen uit Shopify (vervangt manuele offertes op klantniveau).
-- Leveringen plannen via scheduled_start — zichtbaar op de agenda.

create table if not exists public.shopify_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  shopify_order_id text not null,
  shopify_order_number text,
  name text,
  email text,
  customer_name text,
  financial_status text,
  fulfillment_status text,
  total_price_cents integer,
  currency text default 'EUR',
  line_items jsonb not null default '[]'::jsonb,
  ordered_at timestamptz,
  -- Levering
  delivery_status text not null default 'unscheduled'
    check (delivery_status in (
      'unscheduled', 'scheduled', 'in_progress', 'delivered', 'cancelled'
    )),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  delivery_notes text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopify_order_id)
);

create index if not exists shopify_orders_company_id_idx
  on public.shopify_orders (company_id);
create index if not exists shopify_orders_scheduled_start_idx
  on public.shopify_orders (scheduled_start)
  where scheduled_start is not null and delivery_status in ('scheduled', 'in_progress');
create index if not exists shopify_orders_email_idx
  on public.shopify_orders (lower(email));

alter table public.shopify_orders enable row level security;

drop policy if exists "staff_only" on public.shopify_orders;
create policy "staff_only"
  on public.shopify_orders
  as restrictive
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "staff can manage shopify_orders" on public.shopify_orders;
create policy "staff can manage shopify_orders"
  on public.shopify_orders
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Optionele Shopify-klantkoppeling op company
alter table public.companies
  add column if not exists shopify_customer_id text;

comment on column public.companies.shopify_customer_id is
  'Shopify customer GID of numeric id voor automatische order-koppeling.';
