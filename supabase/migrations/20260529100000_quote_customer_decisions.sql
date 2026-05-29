-- Klant-offerte: publieke goedkeuringspagina met per-regel beslissingen.
--
-- De klant ontvangt een link /q/<signing_token> en kan daar per
-- vervangingsregel akkoord/niet akkoord aanvinken, optioneel een
-- commentaar geven, en de offerte digitaal ondertekenen
-- (naam + email + handtekening).
--
-- 1. Kolommen op quote_lines voor de per-regel beslissing.
-- 2. RPC get_quote_for_signing(token) — leest de offerte publiek.
-- 3. RPC submit_quote_decision(token, name, email, signature, decisions)
--    — schrijft alle per-regel beslissingen + de globale handtekening
--    atomisch en zet de offerte op 'accepted' of 'declined'.
--
-- Idempotente migration.

-- ─────────────────────────────────────────────────────────────────
-- 1. Per-regel beslissing
-- ─────────────────────────────────────────────────────────────────
alter table public.quote_lines
  add column if not exists customer_decision text
    check (customer_decision in ('accepted', 'declined'));

alter table public.quote_lines
  add column if not exists customer_comment text;

alter table public.quote_lines
  add column if not exists decided_at timestamptz;

-- ─────────────────────────────────────────────────────────────────
-- 2. Publieke leesfunctie (anon, via SECURITY DEFINER)
--    Geeft de offerte + lijnen terug als jsonb. Vraagt enkel een
--    geldige signing_token. Geeft NULL terug als de offerte
--    'cancelled' is.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.get_quote_for_signing(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', q.id,
    'reference_number', q.reference_number,
    'title', q.title,
    'status', q.status,
    'intro_note', q.intro_note,
    'valid_until', q.valid_until,
    'margin_pct', q.margin_pct,
    'subtotal_cents', q.subtotal_cents,
    'customer_name', q.customer_name,
    'customer_email', q.customer_email,
    'accepted_at', q.accepted_at,
    'accepted_name', q.accepted_name,
    'accepted_email', q.accepted_email,
    'declined_at', q.declined_at,
    'created_at', q.created_at,
    'company', case
      when c.id is null then null
      else jsonb_build_object(
        'name', c.name,
        'contact_name', c.contact_name
      )
    end,
    'location', case
      when l.id is null then null
      else jsonb_build_object(
        'name', l.name,
        'street', l.street,
        'number', l.number,
        'postal_code', l.postal_code,
        'city', l.city
      )
    end,
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ql.id,
          'line_type', ql.line_type,
          'position', ql.position,
          'supplier', ql.supplier,
          'nieuwkoop_itemcode', ql.nieuwkoop_itemcode,
          'name', ql.name,
          'description', ql.description,
          'spec', ql.spec,
          'image_url', ql.image_url,
          'unit_price_cents', ql.unit_price_cents,
          'quantity', ql.quantity,
          'line_total_cents', ql.line_total_cents,
          'customer_decision', ql.customer_decision,
          'customer_comment', ql.customer_comment,
          'source_visit_plant_id', ql.source_visit_plant_id,
          -- Naam van de te-vervangen plant zodat we per regel kunnen
          -- tonen 'Vervanging voor [oude plant naam] in [ruimte]'.
          'old_plant_name', vp.nickname,
          'old_plant_species', vp.species,
          'room_name', r.name,
          'room_floor', r.floor
        ) order by ql.position, ql.created_at
      )
      from public.quote_lines ql
        left join public.maintenance_visit_plants vp
          on vp.id = ql.source_visit_plant_id
        left join public.plants p on p.id = vp.plant_id
        left join public.rooms r on r.id = p.room_id
      where ql.quote_id = q.id
    ), '[]'::jsonb)
  )
  into result
  from public.quotes q
    left join public.companies c on c.id = q.company_id
    left join public.locations l on l.id = q.location_id
  where q.signing_token = _token
    and q.status <> 'cancelled';

  return result;
end;
$$;

grant execute on function public.get_quote_for_signing(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 3. Publieke schrijffunctie — alle decisions + handtekening
--    atomisch verwerken. Verwacht JSON-array
--    [{ id: uuid, decision: 'accepted'|'declined', comment: text }]
-- ─────────────────────────────────────────────────────────────────
create or replace function public.submit_quote_decision(
  _token text,
  _name text,
  _email text,
  _signature text,
  _decisions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q_id uuid;
  q_status text;
  any_accepted boolean := false;
  any_declined boolean := false;
  dec jsonb;
  new_status text;
begin
  if _token is null or length(trim(_token)) = 0 then
    raise exception 'Geen geldige link.';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'Naam verplicht.';
  end if;
  if _signature is null or length(_signature) < 100 then
    raise exception 'Handtekening ontbreekt.';
  end if;

  select id, status into q_id, q_status
  from public.quotes
  where signing_token = _token
  for update;

  if q_id is null then
    raise exception 'Offerte niet gevonden.';
  end if;

  if q_status in ('accepted', 'declined', 'cancelled', 'ordered') then
    raise exception 'Deze offerte werd reeds beantwoord.';
  end if;

  -- Per-regel beslissing wegschrijven. Niet-vermelde regels blijven
  -- ongemoeid (geen decision). De UI vult standaard 'accepted' in,
  -- dus dat zou normaal niet voorkomen.
  if _decisions is not null and jsonb_typeof(_decisions) = 'array' then
    for dec in select * from jsonb_array_elements(_decisions)
    loop
      update public.quote_lines
      set
        customer_decision = (dec->>'decision'),
        customer_comment = nullif(dec->>'comment', ''),
        decided_at = now()
      where id = (dec->>'id')::uuid
        and quote_id = q_id;
      if (dec->>'decision') = 'accepted' then any_accepted := true; end if;
      if (dec->>'decision') = 'declined' then any_declined := true; end if;
    end loop;
  end if;

  -- Status: tenminste 1 regel geaccepteerd → 'accepted', anders 'declined'.
  if any_accepted then
    new_status := 'accepted';
  else
    new_status := 'declined';
  end if;

  update public.quotes
  set
    status = new_status,
    accepted_at = case when new_status = 'accepted' then now() else accepted_at end,
    accepted_name = case when new_status = 'accepted' then _name else accepted_name end,
    accepted_email = case when new_status = 'accepted' then nullif(_email, '') else accepted_email end,
    signature_data = case when new_status = 'accepted' then _signature else signature_data end,
    declined_at = case when new_status = 'declined' then now() else declined_at end,
    updated_at = now()
  where id = q_id;

  return jsonb_build_object(
    'ok', true,
    'status', new_status,
    'accepted_count', (select count(*) from public.quote_lines where quote_id = q_id and customer_decision = 'accepted'),
    'declined_count', (select count(*) from public.quote_lines where quote_id = q_id and customer_decision = 'declined')
  );
end;
$$;

grant execute on function public.submit_quote_decision(text, text, text, text, jsonb) to anon, authenticated;
