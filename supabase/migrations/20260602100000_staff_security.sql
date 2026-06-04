-- Beheerder/klant-scheiding op DB-niveau.
--
-- Portaal-klanten zijn ook 'authenticated', dus rol-scheiding alleen volstaat
-- niet. We gebruiken een expliciete beheerder-allowlist (staff_users) + een
-- helper is_staff(), en leggen een RESTRICTIEVE "staff_only"-laag op alle
-- gevoelige tabellen. Restrictief = wordt ge-AND met de bestaande policies:
-- beheerders houden toegang, ingelogde klanten worden geblokkeerd.
--
-- Catalogus-tabellen (nieuwkoop_products / nieuwkoop_stock) worden BEWUST niet
-- vergrendeld, zodat de anonieme webshop blijft werken. Portaal-data voor
-- klanten loopt via SECURITY DEFINER-RPC's die RLS omzeilen.

create table if not exists public.staff_users (
  email text primary key,
  created_at timestamptz default now()
);

-- Eén beheerder: jelle@stera.be. Verwijder alle andere.
insert into public.staff_users (email) values (lower('jelle@stera.be'))
  on conflict do nothing;
delete from public.staff_users where lower(email) <> lower('jelle@stera.be');

alter table public.staff_users enable row level security;
-- Geen policy → enkel bereikbaar via de SECURITY DEFINER-functie hieronder.

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_users s
    where lower(s.email) = lower(auth.jwt() ->> 'email')
  );
$$;
grant execute on function public.is_staff() to authenticated, anon;

-- Restrictieve "enkel-beheerder"-laag op de gevoelige tabellen.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','locations','rooms','plants',
    'maintenance_visits','maintenance_visit_plants','maintenance_visit_consumables',
    'maintenance_visit_logs','maintenance_visit_pause_logs','maintenance_visit_rooms',
    'plant_care_logs','plant_maintenance_logs','plant_reports',
    'work_orders','quotes','quote_lines','consumable_catalog',
    'stera_products','collections','collection_items','margin_config',
    'portal_contacts'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff_only" on public.%I', t);
    execute format(
      'create policy "staff_only" on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())',
      t
    );
  end loop;
end $$;
