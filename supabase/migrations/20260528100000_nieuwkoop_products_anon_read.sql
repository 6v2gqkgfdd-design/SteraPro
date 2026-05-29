-- Anon-rol mag de leverancier-productcatalogus lezen.
--
-- De catalogus-pagina (publiek toegankelijk) heeft per item de
-- afmetingen (length/width/depth) en item_variety_nl nodig om de
-- juiste pot-vorm te detecteren en het beplantingssysteem te tonen.
-- Deze velden zitten niet in de view v_nieuwkoop_with_margin, dus
-- moet de pagina rechtstreeks uit nieuwkoop_products kunnen lezen.
--
-- De tabel bevat alleen publieke productcatalogus-info, geen
-- klantgegevens, dus een open SELECT-policy is veilig.
--
-- Idempotente migration.

alter table public.nieuwkoop_products enable row level security;

drop policy if exists "nieuwkoop_products_anon_read"
  on public.nieuwkoop_products;

create policy "nieuwkoop_products_anon_read"
  on public.nieuwkoop_products
  for select
  to anon, authenticated
  using (true);
