-- ──────────────────────────────────────────────────────────────────
-- Publieke plantweergave (/p/[slug]) zonder login.
--
-- Probleem: de klantweergave moet werken voor bezoekers die NIET
-- ingelogd zijn (de klant scant een QR of krijgt een link). De
-- plants-tabel staat via Row Level Security enkel open voor
-- ingelogde gebruikers, dus voor een klant kwam er telkens
-- "QR-code niet herkend".
--
-- Oplossing — zelfde aanpak als de werkbon-tekenpagina: één
-- SECURITY DEFINER functie die exact de gegevens van één plant
-- teruggeeft op basis van haar qr_slug. De tabel zelf blijft
-- afgeschermd; anonieme bezoekers kunnen dus niet zomaar alle
-- planten opvragen, enkel de plant achter een geldige slug.
-- ──────────────────────────────────────────────────────────────────

create or replace function public.get_public_plant(_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result  jsonb;
  v_plant public.plants%rowtype;
begin
  if _slug is null or length(trim(_slug)) = 0 then
    return null;
  end if;

  select * into v_plant
  from public.plants
  where qr_slug = _slug
  limit 1;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', v_plant.id,
    'qr_slug', v_plant.qr_slug,
    'nickname', v_plant.nickname,
    'plant_code', v_plant.plant_code,
    'reference_code', v_plant.reference_code,
    'species', v_plant.species,
    'status', v_plant.status,
    'photo_url', v_plant.photo_url,
    'care_tips', v_plant.care_tips,
    'is_dead', v_plant.is_dead,
    'is_dying', v_plant.is_dying,
    'needs_replacement', v_plant.needs_replacement,
    -- Laatste onderhoud: meest recente visit-plant rij van deze plant.
    'latest_visit', (
      select jsonb_build_object(
        'performed_at', coalesce(v.ended_at, v.scheduled_start),
        'action_watered', vp.action_watered,
        'action_pruned', vp.action_pruned,
        'action_fed', vp.action_fed,
        'action_cleaned', vp.action_cleaned,
        'action_rotated', vp.action_rotated,
        'action_repotted', vp.action_repotted,
        'action_replaced', vp.action_replaced
      )
      from public.maintenance_visit_plants vp
      join public.maintenance_visits v on v.id = vp.visit_id
      where vp.plant_id = v_plant.id
      order by vp.created_at desc
      limit 1
    ),
    -- Laatste onderhoudsfoto: meest recente visit-plant rij mét foto.
    'maintenance_photo_url', (
      select vp.photo_url
      from public.maintenance_visit_plants vp
      where vp.plant_id = v_plant.id
        and vp.photo_url is not null
      order by vp.created_at desc
      limit 1
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_public_plant(text) to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────
-- Klantmeldingen (plant_reports) insertbaar houden voor niet-ingelogde
-- bezoekers.
--
-- De oude insert-policy controleerde via een subquery op de plants-
-- tabel of de plant bestond. Maar plants is voor anonieme bezoekers
-- afgeschermd, dus die subquery gaf niets terug en de melding werd
-- geweigerd. De foreign key plant_reports.plant_id → plants(id)
-- garandeert sowieso al dat plant_id naar een bestaande plant wijst,
-- dus de subquery-check is overbodig.
-- ──────────────────────────────────────────────────────────────────
drop policy if exists "Anon can insert plant_reports" on public.plant_reports;
create policy "Anon can insert plant_reports"
on public.plant_reports
for insert
to anon, authenticated
with check (true);

-- ──────────────────────────────────────────────────────────────────
-- Foto bij een klantmelding: een niet-ingelogde bezoeker moet een
-- foto kunnen uploaden. Toegestaan, maar enkel naar de map reports/
-- in de plant-photos bucket — niet naar de rest van de opslag.
-- ──────────────────────────────────────────────────────────────────
drop policy if exists "Anon can upload plant report photos" on storage.objects;
create policy "Anon can upload plant report photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'plant-photos'
  and (storage.foldername(name))[1] = 'reports'
);
