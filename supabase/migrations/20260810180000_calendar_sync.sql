-- iPhone / iCloud-agenda ↔ SteraPro
--
-- maintenance_visits krijgen een stabiele calendar_uid zodat we events
-- uit een ICS-feed (publieke iCloud-kalender) kunnen upserten zonder
-- dubbels. App-eigen events exporteren we als UID stera-visit-{id}@….
--
-- calendar_sync_settings houdt de import-URL en de geheime feed-token
-- bij (één rij, singleton).

alter table public.maintenance_visits
  add column if not exists calendar_uid text,
  add column if not exists calendar_source text;

comment on column public.maintenance_visits.calendar_uid is
  'ICS UID van het gekoppelde agenda-event (iCloud of eigen export).';
comment on column public.maintenance_visits.calendar_source is
  'Herkomst: app | iphone. iphone = geïmporteerd uit ICS-feed.';

create unique index if not exists maintenance_visits_calendar_uid_uidx
  on public.maintenance_visits (calendar_uid)
  where calendar_uid is not null;

create table if not exists public.calendar_sync_settings (
  id integer primary key default 1 check (id = 1),
  import_ics_url text,
  feed_token text not null default encode(gen_random_bytes(24), 'hex'),
  last_sync_at timestamptz,
  last_sync_ok boolean,
  last_sync_message text,
  updated_at timestamptz default now()
);

insert into public.calendar_sync_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.calendar_sync_settings enable row level security;

drop policy if exists "staff_only" on public.calendar_sync_settings;
create policy "staff_only"
  on public.calendar_sync_settings
  as restrictive
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Bestaande authenticated policies (als die via generieke setup komen)
-- plus restrictive staff_only. Voor singleton-tabel: expliciete all-policy
-- voor authenticated staff is genoeg via is_staff; service role omzeilt RLS.
drop policy if exists "staff can manage calendar_sync_settings"
  on public.calendar_sync_settings;
create policy "staff can manage calendar_sync_settings"
  on public.calendar_sync_settings
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());
