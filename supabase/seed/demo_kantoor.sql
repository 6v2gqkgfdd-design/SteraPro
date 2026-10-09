-- Demo Kantoor — NIET uitvoeren op productie.
--
-- De Vercel-preview van dit project gebruikt dezelfde Supabase als
-- productie. Daarom weigert dit bestand te starten. De preview die
-- Jelle kan testen is de in-app demosessie:
--   /portal/demo
--   /p/dk-7f3a9c2e1b4d8a60e1
--   /p/dk-7f3a9c2e1b4d8a60e2
--   /p/dk-7f3a9c2e1b4d8a60e3
--
-- Veilige vervolgstap na een expliciete go: een aparte Supabase-branch
-- (of een schema demo) en dán pas deze dataset laden. Geen echte
-- klantnamen in dit bestand.

do $$
begin
  raise exception
    'demo_kantoor.sql weigert te draaien. Alleen documentatie tot er een niet-productiedatabase is.';
end
$$;
