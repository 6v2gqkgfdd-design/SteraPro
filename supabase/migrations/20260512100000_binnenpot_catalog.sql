-- Binnenpotten als aparte catalog-items per maat, met prijzen.
--
-- Voorheen was er één generieke "Plantenpot (binnenpot)" zonder
-- prijs. Door per maat een eigen catalog-row te seeden krijgen we:
--   - automatische prijsberekening in de werkbon (unit_price_cents)
--   - vlotte selectie in de verbruiksgoederen-dropdown
--   - automatische koppeling vanuit de plant-onderhoud-pagina
--     ("Verpot + maat C3" → catalog_item_id van "Binnenpot C3")
--
-- Prijzen zijn een eerste inschatting (gebaseerd op
-- lib/pot-sizes.ts). Jelle past ze later aan met de échte
-- inkoopprijzen — gewoon de unit_price_cents waarden hieronder
-- aanpassen en deze migration opnieuw runnen (idempotent door
-- on conflict).

insert into public.consumable_catalog
  (name,             default_unit, sort_order, unit_size, unit_price_cents, default_quantity, description)
values
  ('Binnenpot C1',   'stuk', 100, 1,   350, 1, 'Ø 11-13 cm · 1 L'),
  ('Binnenpot C1,3', 'stuk', 101, 1,   400, 1, 'Ø 13 cm · 1,3 L'),
  ('Binnenpot C1,5', 'stuk', 102, 1,   450, 1, 'Ø 13-15 cm · 1,5 L'),
  ('Binnenpot C2',   'stuk', 103, 1,   550, 1, 'Ø 17 cm · 2 L'),
  ('Binnenpot C2,5', 'stuk', 104, 1,   650, 1, 'Ø 18 cm · 2,5 L'),
  ('Binnenpot C3',   'stuk', 105, 1,   750, 1, 'Ø 19-21 cm · 3 L'),
  ('Binnenpot C4',   'stuk', 106, 1,   900, 1, 'Ø 21-23 cm · 4 L'),
  ('Binnenpot C5',   'stuk', 107, 1,  1100, 1, 'Ø 22-24 cm · 5 L'),
  ('Binnenpot C7,5', 'stuk', 108, 1,  1500, 1, 'Ø 26 cm · 7,5 L'),
  ('Binnenpot C10',  'stuk', 109, 1,  2000, 1, 'Ø 28-30 cm · 10 L'),
  ('Binnenpot C12',  'stuk', 110, 1,  2400, 1, 'Ø 30-32 cm · 12 L'),
  ('Binnenpot C15',  'stuk', 111, 1,  2900, 1, 'Ø 33-35 cm · 15 L'),
  ('Binnenpot C20',  'stuk', 112, 1,  3700, 1, 'Ø 35-38 cm · 20 L'),
  ('Binnenpot C25',  'stuk', 113, 1,  4500, 1, 'Ø 38-40 cm · 25 L'),
  ('Binnenpot C30',  'stuk', 114, 1,  5500, 1, 'Ø 40-42 cm · 30 L'),
  ('Binnenpot C35',  'stuk', 115, 1,  6500, 1, 'Ø 42-45 cm · 35 L'),
  ('Binnenpot C45',  'stuk', 116, 1,  8500, 1, 'Ø 45-48 cm · 45 L'),
  ('Binnenpot C55',  'stuk', 117, 1, 10000, 1, 'Ø 48-50 cm · 55 L'),
  ('Binnenpot C70',  'stuk', 118, 1, 13000, 1, 'Ø 50-55 cm · 70 L'),
  ('Binnenpot C90',  'stuk', 119, 1, 17000, 1, 'Ø 55-60 cm · 90 L'),
  ('Binnenpot C130', 'stuk', 120, 1, 23000, 1, 'Ø 60-65 cm · 130 L'),
  ('Binnenpot C180', 'stuk', 121, 1, 30000, 1, 'Ø 65-75 cm · 180 L')
on conflict (name) do update set
  default_unit       = excluded.default_unit,
  sort_order         = excluded.sort_order,
  unit_size          = excluded.unit_size,
  unit_price_cents   = excluded.unit_price_cents,
  default_quantity   = excluded.default_quantity,
  description        = excluded.description,
  active             = true;

-- Oude generieke "Plantenpot (binnenpot)" deactiveren — vervangen
-- door de specifieke maten hierboven. Bestaande visit_consumables
-- die ernaar verwijzen blijven werken (we verwijderen 'm niet).
update public.consumable_catalog
   set active = false
 where name = 'Plantenpot (binnenpot)';
