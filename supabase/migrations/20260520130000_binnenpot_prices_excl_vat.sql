-- ──────────────────────────────────────────────────────────────────
-- Binnenpot-prijzen corrigeren: van incl. btw naar excl. btw.
--
-- De binnenpot-prijzen in consumable_catalog werden ingegeven
-- inclusief 21% btw, terwijl de werkbon ze toont onder de kop
-- "Prijzen excl. btw". Deze migration deelt die prijzen één keer
-- door 1,21 zodat het label op de werkbon klopt.
--
-- Idempotent: een klein bookkeeping-tabelletje (_applied_data_fixes)
-- zorgt ervoor dat de omrekening niet per ongeluk twee keer gebeurt.
-- ──────────────────────────────────────────────────────────────────

-- Bookkeeping-tabel voor eenmalige data-correcties.
create table if not exists public._applied_data_fixes (
  key         text primary key,
  applied_at  timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from public._applied_data_fixes
    where key = 'binnenpot_prices_excl_vat_21'
  ) then
    -- Enkel de binnenpot-regels (niet potgrond, voeding, bladglans,
    -- hydrokorrels of cachepot/sierpot). round(...) houdt het op
    -- hele centen.
    update public.consumable_catalog
       set unit_price_cents = round(unit_price_cents / 1.21)::int
     where name ilike '%binnenpot%'
       and unit_price_cents is not null;

    insert into public._applied_data_fixes (key)
    values ('binnenpot_prices_excl_vat_21');
  end if;
end $$;
