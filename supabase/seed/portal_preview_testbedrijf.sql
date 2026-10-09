-- Fictief testbedrijf voor een NIET-productie-database.
-- Niet op de productie-Supabase draaien: deze PR past geen data toe.
--
-- Na de migratie 20261009140000_portal_customer_rpcs.sql:
--   1. Maak in Authentication een gebruiker preview-portal@example.com
--      (wachtwoord alleen in die testomgeving, geen mail vanuit deze seed).
--   2. Draai dit bestand.
-- Daarna toont /portal/* de rijen van "Preview Kwekerij De Linde".
-- De offerte-regel heeft bewust een inkoopprijs in de basistabel;
-- portal_my_quotes geeft die kolom niet terug.

insert into public.companies (
  id, name, contact_name, email, city, country, has_maintenance_contract
) values (
  '11111111-1111-4111-8111-111111111111',
  'Preview Kwekerij De Linde',
  'Preview Contact',
  'preview-portal@example.com',
  'Gent',
  'BE',
  true
) on conflict (id) do nothing;

insert into public.locations (id, company_id, name, city, country)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Toonzaal',
  'Gent',
  'BE'
) on conflict (id) do nothing;

insert into public.rooms (id, location_id, name, floor)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'Inkom',
  '0'
) on conflict (id) do nothing;

insert into public.plants (
  id, company_id, location_id, room_id, plant_code, nickname, species,
  status, installed_at, qr_slug, notes
) values
  (
    '44444444-4444-4444-8444-444444444441',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'PREVIEW-001',
    'Kentia preview',
    'Howea forsteriana',
    'healthy',
    '2026-01-12',
    'preview-seed-kentia',
    'INTERNE NOTITIE niet tonen'
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'PREVIEW-002',
    'Calathea preview',
    'Calathea orbifolia',
    'needs_attention',
    '2026-02-03',
    'preview-seed-calathea',
    'INTERNE NOTITIE niet tonen'
  )
on conflict (id) do nothing;

insert into public.maintenance_visits (
  id, company_id, location_id, title, status, scheduled_start, ended_at,
  performed_by, general_notes, internal_notes, access_notes
) values
  (
    '55555555-5555-4555-8555-555555555551',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Onderhoud toonzaal',
    'completed',
    '2026-05-21 09:30:00+02',
    '2026-05-21 11:00:00+02',
    'Jonas',
    'Planten nagekeken.',
    'INTERNE NOTITIE niet tonen',
    'poortcode niet tonen'
  ),
  (
    '55555555-5555-4555-8555-555555555552',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Volgend onderhoud',
    'scheduled',
    '2026-10-20 09:30:00+02',
    null,
    'Jonas',
    null,
    'INTERNE NOTITIE niet tonen',
    'poortcode niet tonen'
  )
on conflict (id) do nothing;

insert into public.work_orders (
  id, visit_id, status, signing_token, reference_number,
  invoiced_at, invoice_reference
) values (
  '66666666-6666-4666-8666-666666666661',
  '55555555-5555-4555-8555-555555555551',
  'invoiced',
  'previewseedworkorder',
  'WB-PREVIEW-001',
  '2026-05-31 12:00:00+02',
  'PREVIEW-2026-001'
) on conflict (id) do nothing;

insert into public.quotes (
  id, reference_number, title, company_id, location_id, status,
  signing_token, margin_pct, subtotal_cents, customer_email, created_at
) values (
  '77777777-7777-4777-8777-777777777771',
  'OF-PREVIEW-001',
  'Extra plant inkom',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'sent',
  'previewseedquote',
  0.35,
  2500,
  'preview-portal@example.com',
  '2026-06-02 10:00:00+02'
) on conflict (id) do nothing;

insert into public.quote_lines (
  id, quote_id, line_type, position, name, supplier_unit_price_cents,
  margin_pct, unit_price_cents, quantity, line_total_cents
) values (
  '77777777-7777-4777-8777-777777777772',
  '77777777-7777-4777-8777-777777777771',
  'plant',
  0,
  'Strelitzia nicolai',
  1000,
  0.35,
  2500,
  1,
  2500
) on conflict (id) do nothing;

insert into public.shopify_orders (
  id, company_id, location_id, shopify_order_id, shopify_order_number, name,
  email, financial_status, fulfillment_status, total_price_cents, currency,
  line_items, ordered_at, delivery_status, scheduled_start, raw
) values (
  '88888888-8888-4888-8888-888888888881',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'preview-seed-order-1',
  '9001',
  '#9001',
  'preview-portal@example.com',
  'paid',
  'fulfilled',
  7900,
  'EUR',
  '[{"title":"Strelitzia","quantity":1,"price_cents":7900}]'::jsonb,
  '2026-06-06 14:00:00+02',
  'delivered',
  '2026-06-10 09:00:00+02',
  '{"secret":"niet tonen"}'::jsonb
) on conflict (id) do nothing;

insert into public.portal_contacts (
  id, email, company_id, status, name, requested_company
) values (
  '99999999-9999-4999-8999-999999999991',
  'preview-portal@example.com',
  '11111111-1111-4111-8111-111111111111',
  'approved',
  'Preview Contact',
  'Preview Kwekerij De Linde'
) on conflict (id) do nothing;
