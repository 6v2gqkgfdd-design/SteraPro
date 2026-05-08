-- Werkbonnen (werkorders).
--
-- Eén werkbon per onderhoudsbeurt. Wordt automatisch aangemaakt bij
-- het beëindigen van een visit en doorloopt drie statussen:
--   draft  → 'Nog te versturen' (Jelle moet nog reviewen + verzenden)
--   sent   → 'Wachten op goedkeuring' (klant moet nog tekenen)
--   signed → 'Goedgekeurd' (klant heeft handtekening gezet)
--
-- De publieke ondertekenpagina (/sign/<token>) werkt zonder login. We
-- houden RLS gesloten voor anon en bieden enkel een SECURITY DEFINER
-- RPC aan zodat we de toegang via de signing_token kunnen valideren
-- in plaats van via Postgres-rollen.

-- Klanten kunnen een onderhoudscontract hebben. In dat geval verbergen
-- we uren en verbruiksgoederen op de werkbon — die zijn al gedekt door
-- het contract. Plantvervangingen vallen er WEL buiten en worden dus
-- altijd getoond.
alter table public.companies
  add column if not exists has_maintenance_contract boolean default false;

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'signed', 'cancelled')
  ),
  -- Onvoorspelbare publieke token voor de signing-link.
  signing_token text not null unique
    default replace(gen_random_uuid()::text, '-', ''),
  -- Verzending
  sent_at timestamptz,
  sent_to_email text,
  sent_method text,
  -- Ondertekening
  signed_at timestamptz,
  signed_name text,
  signed_email text,
  -- Handtekening als base64-PNG (data-URL zonder prefix)
  signature_data text,
  signature_ip text,
  -- Factuur-koppeling (optioneel, voor later)
  invoiced_at timestamptz,
  invoice_reference text,
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Eén werkbon per visit
  unique (visit_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_orders_visit_id_fkey'
  ) then
    alter table public.work_orders
      add constraint work_orders_visit_id_fkey
      foreign key (visit_id)
      references public.maintenance_visits (id)
      on delete cascade;
  end if;
end$$;

create index if not exists work_orders_status_idx
  on public.work_orders(status)
  where status <> 'signed';

create index if not exists work_orders_visit_id_idx
  on public.work_orders(visit_id);

drop trigger if exists set_work_orders_updated_at on public.work_orders;
create trigger set_work_orders_updated_at
before update on public.work_orders
for each row execute function public.set_updated_at();

alter table public.work_orders enable row level security;

drop policy if exists "Authenticated can read work_orders" on public.work_orders;
create policy "Authenticated can read work_orders"
on public.work_orders
for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert work_orders" on public.work_orders;
create policy "Authenticated can insert work_orders"
on public.work_orders
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update work_orders" on public.work_orders;
create policy "Authenticated can update work_orders"
on public.work_orders
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete work_orders" on public.work_orders;
create policy "Authenticated can delete work_orders"
on public.work_orders
for delete
to authenticated
using (true);

-- ─────────────────────────────────────────────────────────────────
-- RPC's voor de publieke /sign/[token] flow
-- ─────────────────────────────────────────────────────────────────

create or replace function public.get_work_order_for_signing(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', wo.id,
    'status', wo.status,
    'signed_at', wo.signed_at,
    'signed_name', wo.signed_name,
    'signed_email', wo.signed_email,
    'sent_at', wo.sent_at,
    'visit', jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'scheduled_start', v.scheduled_start,
      'started_at', v.started_at,
      'ended_at', v.ended_at,
      'pause_total_minutes', v.pause_total_minutes,
      'planned_tasks', v.planned_tasks,
      'general_notes', v.general_notes
    ),
    'company', jsonb_build_object(
      'name', c.name,
      'contact_name', c.contact_name,
      'email', c.email,
      'has_maintenance_contract', coalesce(c.has_maintenance_contract, false)
    ),
    'location', jsonb_build_object(
      'name', l.name,
      'street', l.street,
      'number', l.number,
      'postal_code', l.postal_code,
      'city', l.city
    ),
    'plants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vp.id,
          'plant_id', vp.plant_id,
          'nickname', p.nickname,
          'species', p.species,
          'reference_code', p.reference_code,
          'photo_url', vp.photo_url,
          'notes', vp.notes,
          'health_status', vp.health_status,
          'action_watered', vp.action_watered,
          'action_pruned', vp.action_pruned,
          'action_fed', vp.action_fed,
          'action_cleaned', vp.action_cleaned,
          'action_rotated', vp.action_rotated,
          'action_repotted', vp.action_repotted,
          'action_replaced', vp.action_replaced,
          'action_checked', vp.action_checked,
          'followup_replace', vp.followup_replace,
          'replacement_light_level', vp.replacement_light_level,
          'replacement_height_cm', vp.replacement_height_cm,
          'replacement_pot_diameter_cm', vp.replacement_pot_diameter_cm,
          'replacement_needs_outer_pot', vp.replacement_needs_outer_pot,
          'replacement_notes', vp.replacement_notes
        )
        order by vp.created_at
      )
      from public.maintenance_visit_plants vp
      left join public.plants p on p.id = vp.plant_id
      where vp.visit_id = v.id
    ), '[]'::jsonb),
    'consumables', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vc.id,
          'name', coalesce(vc.custom_name, cc.name),
          'quantity', vc.quantity,
          'unit', vc.unit,
          'notes', vc.notes
        )
        order by vc.created_at
      )
      from public.maintenance_visit_consumables vc
      left join public.consumable_catalog cc on cc.id = vc.catalog_item_id
      where vc.visit_id = v.id
    ), '[]'::jsonb)
  ) into result
  from public.work_orders wo
  join public.maintenance_visits v on v.id = wo.visit_id
  left join public.companies c on c.id = v.company_id
  left join public.locations l on l.id = v.location_id
  where wo.signing_token = _token
    and wo.status in ('sent', 'signed');

  return result;
end;
$$;

grant execute on function public.get_work_order_for_signing(text) to anon, authenticated;

create or replace function public.sign_work_order(
  _token text,
  _name text,
  _email text,
  _signature text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  if _token is null or length(trim(_token)) = 0 then
    raise exception 'Geen geldige token.';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'Naam is verplicht.';
  end if;
  if _signature is null or length(_signature) < 100 then
    raise exception 'Handtekening lijkt leeg.';
  end if;

  update public.work_orders
  set
    status = 'signed',
    signed_at = now(),
    signed_name = trim(_name),
    signed_email = nullif(trim(_email), ''),
    signature_data = _signature,
    updated_at = now()
  where signing_token = _token
    and status = 'sent'
    and signed_at is null;

  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'Werkbon niet gevonden of al getekend.';
  end if;

  return true;
end;
$$;

grant execute on function public.sign_work_order(text, text, text, text) to anon, authenticated;
