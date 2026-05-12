-- Echte aankoop- en verkoopprijzen voor verbruiksgoederen (mei 2026).
-- Aangeleverd door Jelle, verkoopprijzen waar nodig bepaald op
-- 2× aankoopprijs (klassieke servicemarge).
--
-- Verkoopprijzen zijn ALTIJD excl. btw (consistent met de rest van
-- consumable_catalog; werkbon toont 'Prijzen excl. btw').

-- 1) Bladglans → Spring Bladglans 750 ml.
--    Aankoop €6,25 excl. → verkoop €12,50 excl. (2×).
update public.consumable_catalog
   set name = 'Spring Bladglans 750ml',
       unit_size = 1,
       unit_price_cents = 1250,
       default_quantity = 1,
       default_unit = 'spuitbus',
       description = '750 ml spuitbus — ± 1 per onderhoud'
 where name in ('Bladglans', 'Spring Bladglans 750ml');

-- 2) Neemolie (nieuw item).
--    Verkoop €6,90 incl. btw = €5,70 excl. btw (21% btw).
insert into public.consumable_catalog
  (name, default_unit, sort_order, unit_size, unit_price_cents,
   default_quantity, description, active)
values
  ('Neemolie', 'flesje', 45, 1, 570, 1,
   'Natuurlijk insecticide — € 6,90 incl. btw (= € 5,70 excl. btw)',
   true)
on conflict (name) do update set
  default_unit     = excluded.default_unit,
  sort_order       = excluded.sort_order,
  unit_size        = excluded.unit_size,
  unit_price_cents = excluded.unit_price_cents,
  default_quantity = excluded.default_quantity,
  description      = excluded.description,
  active           = excluded.active;

-- 3) Potgrond → veenvrij substraat 45 L zak.
--    Aankoop €14 excl. → verkoop €28 excl. (2×, ≈ €0,62 / L).
--    Naam BLIJFT 'Potgrond' want de auto-aggregatie bij verpotting
--    zoekt op die exacte naam — niet hernoemen.
update public.consumable_catalog
   set unit_size = 45,
       unit_price_cents = 2800,
       default_quantity = 10,
       description = 'Veenvrij substraat — 21 kg / 45 L zak'
 where name = 'Potgrond';
