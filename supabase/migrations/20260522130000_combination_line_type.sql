-- Sta 'combination' toe als waarde van quote_lines.line_type.
--
-- Achtergrond: Stera schakelt over op het Nieuwkoop "All-in-1 concepts"
-- assortiment (productgroep 275) — combinaties van plant + pot,
-- voorgekweekt en met watermeter. In de offerte-opmaak is dat één
-- regel per geleverd geheel, niet meer een aparte plant + buitenpot.
--
-- Idempotente migratie — mag opnieuw uitgevoerd worden.
alter table public.quote_lines
  drop constraint if exists quote_lines_line_type_check;

alter table public.quote_lines
  add constraint quote_lines_line_type_check
  check (line_type in ('plant', 'outer_pot', 'custom', 'combination'));
