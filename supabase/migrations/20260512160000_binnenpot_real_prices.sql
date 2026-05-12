-- Echte inkoopprijzen voor binnenpotten (mei 2026) — zoals doorgegeven
-- door Jelle vanuit Stera Plantbar. Vervangt de schattingen uit de
-- vorige seed (20260512100000_binnenpot_catalog.sql).
--
-- Mapping diameter → C-code:
--   15cm → C1,5
--   17cm → C2
--   19cm → C3
--   21cm → C4
--   24cm → C5
--   27cm → C7,5
--   30cm → C10
--   34cm → C15
--   38cm → C20
--
-- Niet-gebruikte codes (C1, C1,3, C2,5, C12, C25+) blijven op hun
-- schatting staan — kan later opgeruimd worden als Jelle die nooit
-- aanbiedt.

update public.consumable_catalog set unit_price_cents =  180 where name = 'Binnenpot C1,5';
update public.consumable_catalog set unit_price_cents =  220 where name = 'Binnenpot C2';
update public.consumable_catalog set unit_price_cents =  250 where name = 'Binnenpot C3';
update public.consumable_catalog set unit_price_cents =  250 where name = 'Binnenpot C4';
update public.consumable_catalog set unit_price_cents =  300 where name = 'Binnenpot C5';
update public.consumable_catalog set unit_price_cents =  460 where name = 'Binnenpot C7,5';
update public.consumable_catalog set unit_price_cents = 1100 where name = 'Binnenpot C10';
update public.consumable_catalog set unit_price_cents = 1200 where name = 'Binnenpot C15';
update public.consumable_catalog set unit_price_cents = 1800 where name = 'Binnenpot C20';
