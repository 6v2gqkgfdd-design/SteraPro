-- Klantenportaal: gegevens per goedgekeurd bedrijf.
--
-- De basistabellen blijven achter de restrictieve staff_only-policy.
-- Een portaalgebruiker leest alleen via deze SECURITY DEFINER-functies,
-- en die geven enkel klantveilige kolommen terug:
--   geen internal_notes / access_notes, geen companies.notes, geen plant-notes,
--   geen inkoop (supplier_unit_price_cents, margin_pct), geen handtekening,
--   geen Shopify-raw.
--
-- Niet op productie draaien vanuit deze PR. Het bestand is de migratie;
-- toepassen gebeurt pas na een aparte go.

create table if not exists public.portal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_email text not null,
  kind text not null default 'nieuwe_planten',
  species text,
  quantity text,
  location_note text,
  message text not null,
  status text not null default 'nieuw'
    check (status in ('nieuw', 'in_behandeling', 'afgehandeld', 'geannuleerd')),
  created_at timestamptz not null default now()
);

create index if not exists portal_requests_company_created_idx
  on public.portal_requests (company_id, created_at desc);

create index if not exists portal_contacts_email_lower_idx
  on public.portal_contacts (lower(email));

alter table public.portal_requests enable row level security;

drop policy if exists "staff can manage portal_requests" on public.portal_requests;
create policy "staff can manage portal_requests"
  on public.portal_requests
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "staff_only" on public.portal_requests;
create policy "staff_only"
  on public.portal_requests
  as restrictive
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke all on table public.portal_requests from anon;
grant select, insert, update, delete on table public.portal_requests to authenticated;

-- Eigen goedgekeurde company, of null.
create or replace function public.portal_my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.company_id
  from public.portal_contacts c
  where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and c.status = 'approved'
    and c.company_id is not null
  order by c.created_at desc
  limit 1
$$;

create or replace function public.portal_my_company()
returns table (
  company_id uuid,
  company_name text,
  has_maintenance_contract boolean,
  city text,
  location_count bigint,
  plant_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    coalesce(c.has_maintenance_contract, false),
    c.city,
    (select count(*) from public.locations l where l.company_id = c.id),
    (select count(*) from public.plants p where p.company_id = c.id)
  from public.companies c
  where c.id = public.portal_my_company_id()
$$;

create or replace function public.portal_my_plants()
returns table (
  id uuid,
  nickname text,
  species text,
  status text,
  photo_url text,
  is_artificial boolean,
  is_dying boolean,
  is_dead boolean,
  needs_replacement boolean,
  installed_at date,
  location_name text,
  room_name text,
  room_floor text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nickname,
    p.species,
    p.status,
    p.photo_url,
    p.is_artificial,
    p.is_dying,
    p.is_dead,
    p.needs_replacement,
    p.installed_at,
    l.name,
    r.name,
    r.floor
  from public.plants p
  left join public.locations l on l.id = p.location_id
  left join public.rooms r on r.id = p.room_id
  where p.company_id = public.portal_my_company_id()
  order by lower(coalesce(p.nickname, p.species, ''))
  limit 500
$$;

create or replace function public.portal_my_visits()
returns table (
  id uuid,
  title text,
  status text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  ended_at timestamptz,
  performed_by text,
  general_notes text,
  location_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.title,
    v.status,
    v.scheduled_start,
    v.scheduled_end,
    v.ended_at,
    v.performed_by,
    v.general_notes,
    l.name
  from public.maintenance_visits v
  left join public.locations l on l.id = v.location_id
  where v.company_id = public.portal_my_company_id()
  order by v.scheduled_start desc nulls last
  limit 200
$$;

create or replace function public.portal_my_work_orders()
returns table (
  id uuid,
  status text,
  reference_number text,
  created_at timestamptz,
  signed_at timestamptz,
  invoiced_at timestamptz,
  invoice_reference text,
  visit_title text,
  scheduled_start timestamptz,
  performed_by text,
  location_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wo.id,
    wo.status,
    wo.reference_number,
    wo.created_at,
    wo.signed_at,
    wo.invoiced_at,
    wo.invoice_reference,
    v.title,
    v.scheduled_start,
    v.performed_by,
    l.name
  from public.work_orders wo
  join public.maintenance_visits v on v.id = wo.visit_id
  left join public.locations l on l.id = v.location_id
  where v.company_id = public.portal_my_company_id()
    and wo.status in ('sent', 'signed', 'invoiced', 'archived')
  order by coalesce(v.scheduled_start, wo.created_at) desc
  limit 200
$$;

create or replace function public.portal_my_quotes()
returns table (
  id uuid,
  reference_number text,
  title text,
  status text,
  intro_note text,
  valid_until date,
  subtotal_cents integer,
  created_at timestamptz,
  location_name text,
  signing_token text,
  lines jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id,
    q.reference_number,
    q.title,
    q.status,
    q.intro_note,
    q.valid_until,
    q.subtotal_cents,
    q.created_at,
    l.name,
    q.signing_token,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', ql.name,
          'description', ql.description,
          'quantity', ql.quantity,
          'unit_price_cents', ql.unit_price_cents,
          'line_total_cents', ql.line_total_cents,
          'customer_decision', ql.customer_decision
        )
        order by ql.position, ql.created_at
      )
      from public.quote_lines ql
      where ql.quote_id = q.id
    ), '[]'::jsonb)
  from public.quotes q
  left join public.locations l on l.id = q.location_id
  where q.company_id = public.portal_my_company_id()
    and q.status in ('sent', 'accepted', 'declined', 'ordered', 'expired')
  order by q.created_at desc
  limit 100
$$;

create or replace function public.portal_my_orders()
returns table (
  id uuid,
  name text,
  shopify_order_number text,
  financial_status text,
  fulfillment_status text,
  total_price_cents integer,
  currency text,
  ordered_at timestamptz,
  delivery_status text,
  scheduled_start timestamptz,
  location_name text,
  line_items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.shopify_order_number,
    o.financial_status,
    o.fulfillment_status,
    o.total_price_cents,
    o.currency,
    o.ordered_at,
    o.delivery_status,
    o.scheduled_start,
    l.name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'title', coalesce(item->>'title', 'Artikel'),
          'quantity', coalesce((item->>'quantity')::numeric, 1),
          'variant_title', item->>'variant_title'
        )
      )
      from jsonb_array_elements(coalesce(o.line_items, '[]'::jsonb)) item
    ), '[]'::jsonb)
  from public.shopify_orders o
  left join public.locations l on l.id = o.location_id
  where o.company_id = public.portal_my_company_id()
  order by o.ordered_at desc nulls last
  limit 100
$$;

create or replace function public.portal_my_requests()
returns table (
  id uuid,
  species text,
  quantity text,
  location_note text,
  message text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.species,
    r.quantity,
    r.location_note,
    r.message,
    r.status,
    r.created_at
  from public.portal_requests r
  where r.company_id = public.portal_my_company_id()
  order by r.created_at desc
  limit 50
$$;

create or replace function public.portal_create_plant_request(
  _species text,
  _quantity text,
  _location_note text,
  _message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_company uuid;
  v_message text;
  v_id uuid;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'not authenticated';
  end if;

  select c.company_id into v_company
  from public.portal_contacts c
  where lower(c.email) = v_email
    and c.status = 'approved'
    and c.company_id is not null
  order by c.created_at desc
  limit 1;

  if v_company is null then
    raise exception 'no portal access';
  end if;

  v_message := left(btrim(coalesce(_message, '')), 2000);
  if length(v_message) < 3 then
    raise exception 'message too short';
  end if;

  insert into public.portal_requests (
    company_id,
    contact_email,
    kind,
    species,
    quantity,
    location_note,
    message
  ) values (
    v_company,
    v_email,
    'nieuwe_planten',
    nullif(left(btrim(coalesce(_species, '')), 300), ''),
    nullif(left(btrim(coalesce(_quantity, '')), 80), ''),
    nullif(left(btrim(coalesce(_location_note, '')), 300), ''),
    v_message
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.portal_my_company_id() from public, anon, authenticated;
revoke all on function public.portal_my_company() from public, anon, authenticated;
revoke all on function public.portal_my_plants() from public, anon, authenticated;
revoke all on function public.portal_my_visits() from public, anon, authenticated;
revoke all on function public.portal_my_work_orders() from public, anon, authenticated;
revoke all on function public.portal_my_quotes() from public, anon, authenticated;
revoke all on function public.portal_my_orders() from public, anon, authenticated;
revoke all on function public.portal_my_requests() from public, anon, authenticated;
revoke all on function public.portal_create_plant_request(text, text, text, text) from public, anon, authenticated;

grant execute on function public.portal_my_company_id() to authenticated;
grant execute on function public.portal_my_company() to authenticated;
grant execute on function public.portal_my_plants() to authenticated;
grant execute on function public.portal_my_visits() to authenticated;
grant execute on function public.portal_my_work_orders() to authenticated;
grant execute on function public.portal_my_quotes() to authenticated;
grant execute on function public.portal_my_orders() to authenticated;
grant execute on function public.portal_my_requests() to authenticated;
grant execute on function public.portal_create_plant_request(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
