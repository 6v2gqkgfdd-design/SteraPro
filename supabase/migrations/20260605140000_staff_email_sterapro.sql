-- Beheerder migreren van jelle@stera.be naar jelle@sterapro.be.
--
-- Stap 1 (deze migratie): voeg het nieuwe adres toe en HOUD het oude
-- voorlopig in de allowlist, zodat er geen lockout ontstaat terwijl de
-- Supabase Auth-user wordt omgezet en opnieuw wordt ingelogd.
--
-- Stap 2 (later, na bevestigde login met jelle@sterapro.be): verwijder
-- het oude adres — zie het commentaarblok onderaan.

insert into public.staff_users (email) values (lower('jelle@sterapro.be'))
  on conflict do nothing;

-- Na bevestigde login met het nieuwe adres uitvoeren:
-- delete from public.staff_users where lower(email) = lower('jelle@stera.be');
