-- Eenmalige backfill.
--
-- Tot voor kort kon een dode plant nergens expliciet als "te vervangen"
-- gemarkeerd worden — die vraag bestond nog niet in het
-- onderhoudsformulier. Daardoor staan alle historische dode planten op
-- followup_replace = false (de standaardwaarde), terwijl ze in de
-- praktijk wél vervangen moeten worden.
--
-- We beschouwen daarom elke reeds geregistreerde dode plant als een
-- plant die vervangen moet worden, zodat de oude onderhoudsbeurten als
-- offertevoorstel blijven verschijnen. Vanaf nu stuurt de Ja/Nee-vraag
-- in het onderhoudsformulier dit veld.
update public.maintenance_visit_plants
set followup_replace = true
where health_status = 'dead'
  and followup_replace is distinct from true;
