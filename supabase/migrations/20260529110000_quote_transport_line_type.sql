-- 'transport' toevoegen als geldig line_type op quote_lines.
--
-- Elke nieuwe offerte krijgt automatisch een transport-regel met
-- vast tarief (€110 excl. btw, of €0 wanneer de andere regels samen
-- minstens €750 bedragen — gratis levering vanaf €750).
-- Tech mag deze regel altijd manueel aanpassen of verwijderen.

alter table public.quote_lines
  drop constraint if exists quote_lines_line_type_check;

alter table public.quote_lines
  add constraint quote_lines_line_type_check
  check (line_type in ('plant', 'outer_pot', 'custom', 'combination', 'transport'));
