-- Beheerder gemigreerd van jelle@stera.be naar jelle@sterapro.be (juni 2026).
--
-- jelle@sterapro.be is het nieuwe (en enige) beheerdersadres. Het oude
-- jelle@stera.be wordt uit de allowlist verwijderd. De bijhorende Supabase
-- Auth-user voor jelle@sterapro.be werd apart aangemaakt (e-mail + wachtwoord).

insert into public.staff_users (email) values (lower('jelle@sterapro.be'))
  on conflict do nothing;

delete from public.staff_users where lower(email) = lower('jelle@stera.be');
