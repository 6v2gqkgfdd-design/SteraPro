-- Klantnotitie op een plant, los van de interne plants.notes.
-- Niet toepassen op de productiedatabase vanuit deze PR.
-- De preview deelt die database; Demo Kantoor draait in de app.

alter table public.plants
  add column if not exists customer_note text;

drop function if exists public.portal_my_plants();

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
  room_floor text,
  care_tips text,
  qr_slug text,
  customer_note text
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
    r.floor,
    p.care_tips,
    p.qr_slug,
    p.customer_note
  from public.plants p
  left join public.locations l on l.id = p.location_id
  left join public.rooms r on r.id = p.room_id
  where p.company_id = public.portal_my_company_id()
  order by lower(coalesce(p.nickname, p.species, ''))
  limit 500
$$;

create or replace function public.portal_set_my_plant_note(_plant_id uuid, _note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.portal_my_company_id() is null then
    return;
  end if;
  update public.plants
  set customer_note = nullif(left(btrim(coalesce(_note, '')), 2000), '')
  where id = _plant_id
    and company_id = public.portal_my_company_id();
end;
$$;

revoke all on function public.portal_my_plants() from public, anon, authenticated;
revoke all on function public.portal_set_my_plant_note(uuid, text) from public, anon, authenticated;
grant execute on function public.portal_my_plants() to authenticated;
grant execute on function public.portal_set_my_plant_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';
