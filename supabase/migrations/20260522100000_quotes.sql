-- Offertes (quotes) voor de vervanging van planten bij klanten.
--
-- Wanneer een plant tijdens het onderhoud gemarkeerd is voor
-- vervanging (maintenance_visit_plants.followup_replace), stelt Stera
-- een offerte op met een voorstel van een nieuwe (hydrocultuur-)plant
-- + een buitenpot. De klant keurt die online goed; daarna loopt de
-- bestelling/betaling via Shopify.
--
-- Twee tabellen:
--   quotes        → één offerte (kop: klant, locatie, status, totaal)
--   quote_lines   → de regels (voorgestelde plant, buitenpot, ...)
--
-- Een offerte krijgt een eigen oplopend nummer OF-<jaar>-<volgnr>,
-- net zoals de werkbonnen (WB-...). De publieke goedkeuringspagina
-- werkt straks zonder login via een onvoorspelbare signing_token.

-- ─────────────────────────────────────────────────────────────────
-- 1. quotes
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),

  -- Oplopend offertenummer, bv. OF-2026-001 (trigger vult dit in).
  reference_number text,

  -- Optionele interne titel.
  title text,

  -- Klant + locatie. Set null bij verwijderen zodat de offerte
  -- als administratief document bewaard blijft.
  company_id uuid references public.companies (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,

  -- De onderhoudsbeurt waaruit de vervangplanten komen (optioneel).
  source_visit_id uuid
    references public.maintenance_visits (id) on delete set null,

  status text not null default 'draft' check (
    status in (
      'draft',      -- in opmaak
      'sent',       -- naar klant gestuurd, wacht op goedkeuring
      'accepted',   -- klant heeft goedgekeurd
      'declined',   -- klant heeft afgewezen
      'ordered',    -- doorgezet als Shopify-order
      'expired',    -- vervaldatum voorbij
      'cancelled'   -- ingetrokken
    )
  ),

  -- Onvoorspelbare publieke token voor de goedkeuringslink.
  signing_token text not null unique
    default replace(gen_random_uuid()::text, '-', ''),

  -- Gehanteerde marge (als verhouding, bv. 0.35 = 35% marge op de
  -- Nieuwkoop-inkoopprijs). Snapshot op de offerte zelf.
  margin_pct numeric,

  -- Optioneel begeleidend bericht aan de klant + geldigheidsdatum.
  intro_note text,
  valid_until date,

  -- Contactgegevens klant (voor de offerte en de Shopify-order).
  customer_name text,
  customer_email text,

  -- Goedkeuring door de klant.
  accepted_at timestamptz,
  accepted_name text,
  accepted_email text,
  signature_data text,
  declined_at timestamptz,

  -- Denormaliseerd totaal (excl. btw) — som van de regels.
  subtotal_cents integer not null default 0,

  -- Koppeling naar de Shopify-order (ingevuld in Fase B).
  shopify_draft_order_id text,

  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists quotes_reference_number_idx
  on public.quotes (reference_number);
create index if not exists quotes_status_idx on public.quotes (status);
create index if not exists quotes_location_idx on public.quotes (location_id);
create index if not exists quotes_source_visit_idx
  on public.quotes (source_visit_id);

-- ─────────────────────────────────────────────────────────────────
-- 2. quote_lines
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),

  quote_id uuid not null
    references public.quotes (id) on delete cascade,

  -- De vervangplant waarop deze regel slaat (optioneel — vrije
  -- regels of een losse buitenpot hebben dit niet).
  source_visit_plant_id uuid
    references public.maintenance_visit_plants (id) on delete set null,

  -- Soort regel: een plant, een buitenpot of een vrije regel.
  line_type text not null default 'plant' check (
    line_type in ('plant', 'outer_pot', 'custom')
  ),

  position integer not null default 0,

  -- Herkomst: Nieuwkoop-catalogus of eigen Stera-assortiment.
  supplier text check (supplier in ('nieuwkoop', 'stera')),
  nieuwkoop_itemcode text,

  -- Snapshot van het product, zodat de offerte stabiel blijft ook
  -- als de catalogus later wijzigt.
  name text not null,
  description text,
  spec text,
  image_url text,

  -- Prijzen in eurocent.
  supplier_unit_price_cents integer, -- Nieuwkoop-inkoopprijs
  margin_pct numeric,                -- toegepaste marge op deze regel
  unit_price_cents integer not null default 0,  -- klantprijs per stuk
  quantity integer not null default 1 check (quantity > 0),
  line_total_cents integer not null default 0,

  created_at timestamptz default now()
);

create index if not exists quote_lines_quote_idx
  on public.quote_lines (quote_id);
create index if not exists quote_lines_visit_plant_idx
  on public.quote_lines (source_visit_plant_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. Offertenummer automatisch toekennen (OF-<jaar>-<volgnr>)
-- ─────────────────────────────────────────────────────────────────
create or replace function public.assign_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yr int;
  next_seq int;
begin
  if new.reference_number is not null
     and length(trim(new.reference_number)) > 0 then
    return new;
  end if;

  yr := extract(year from coalesce(new.created_at, now()))::int;

  select coalesce(max(split_part(reference_number, '-', 3)::int), 0) + 1
  into next_seq
  from public.quotes
  where reference_number like 'OF-' || yr || '-%';

  new.reference_number :=
    'OF-' || yr || '-' || lpad(next_seq::text, 3, '0');

  return new;
end;
$$;

drop trigger if exists set_quote_reference on public.quotes;
create trigger set_quote_reference
before insert on public.quotes
for each row execute function public.assign_quote_reference();

-- updated_at automatisch bijhouden (hergebruikt de bestaande functie).
drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
before update on public.quotes
for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 4. Row Level Security
--    Voorlopig enkel toegang voor ingelogde gebruikers. De publieke
--    goedkeuringspagina (Fase B) krijgt later SECURITY DEFINER RPC's,
--    net zoals bij de werkbonnen.
-- ─────────────────────────────────────────────────────────────────
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;

drop policy if exists "Authenticated can read quotes" on public.quotes;
create policy "Authenticated can read quotes"
on public.quotes for select to authenticated using (true);

drop policy if exists "Authenticated can insert quotes" on public.quotes;
create policy "Authenticated can insert quotes"
on public.quotes for insert to authenticated with check (true);

drop policy if exists "Authenticated can update quotes" on public.quotes;
create policy "Authenticated can update quotes"
on public.quotes for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated can delete quotes" on public.quotes;
create policy "Authenticated can delete quotes"
on public.quotes for delete to authenticated using (true);

drop policy if exists "Authenticated can read quote_lines" on public.quote_lines;
create policy "Authenticated can read quote_lines"
on public.quote_lines for select to authenticated using (true);

drop policy if exists "Authenticated can insert quote_lines" on public.quote_lines;
create policy "Authenticated can insert quote_lines"
on public.quote_lines for insert to authenticated with check (true);

drop policy if exists "Authenticated can update quote_lines" on public.quote_lines;
create policy "Authenticated can update quote_lines"
on public.quote_lines for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated can delete quote_lines" on public.quote_lines;
create policy "Authenticated can delete quote_lines"
on public.quote_lines for delete to authenticated using (true);
