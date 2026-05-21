-- Werkbonnummer: een uniek, oplopend referentienummer per werkbon.
--
-- Formaat: WB-<jaar>-<volgnummer>, bv. WB-2026-001.
-- Het volgnummer start elk kalenderjaar opnieuw bij 1.
--
-- Het jaar wordt afgeleid uit created_at van de werkbon. Zo houden
-- bestaande werkbonnen hun oorspronkelijke jaartal en blijven de
-- toegekende nummers stabiel.

-- 1. Kolom toevoegen.
alter table public.work_orders
  add column if not exists reference_number text;

-- 2. Bestaande werkbonnen een nummer geven. Per jaar genummerd op
--    volgorde van aanmaak. Enkel rijen die er nog geen hebben, zodat
--    deze migratie veilig opnieuw kan draaien.
with numbered as (
  select
    id,
    extract(year from coalesce(created_at, now()))::int as yr,
    row_number() over (
      partition by extract(year from coalesce(created_at, now()))
      order by created_at, id
    ) as seq
  from public.work_orders
  where reference_number is null
)
update public.work_orders wo
set reference_number =
  'WB-' || n.yr || '-' || lpad(n.seq::text, 3, '0')
from numbered n
where wo.id = n.id;

-- 3. Uniek maken zodat er nooit twee dezelfde nummers ontstaan.
create unique index if not exists work_orders_reference_number_idx
  on public.work_orders (reference_number);

-- 4. Functie die automatisch het volgende nummer toekent.
--    security definer + vaste search_path zodat de telling altijd
--    alle werkbonnen ziet, los van RLS.
create or replace function public.assign_work_order_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yr int;
  next_seq int;
begin
  -- Al een nummer? Niets doen (bv. manueel gezet of via backfill).
  if new.reference_number is not null
     and length(trim(new.reference_number)) > 0 then
    return new;
  end if;

  yr := extract(year from coalesce(new.created_at, now()))::int;

  -- Hoogste bestaande volgnummer voor dit jaar + 1.
  select coalesce(max(split_part(reference_number, '-', 3)::int), 0) + 1
  into next_seq
  from public.work_orders
  where reference_number like 'WB-' || yr || '-%';

  new.reference_number :=
    'WB-' || yr || '-' || lpad(next_seq::text, 3, '0');

  return new;
end;
$$;

-- 5. Trigger: ken het nummer toe vlak voor het invoegen.
drop trigger if exists set_work_order_reference on public.work_orders;
create trigger set_work_order_reference
before insert on public.work_orders
for each row execute function public.assign_work_order_reference();
