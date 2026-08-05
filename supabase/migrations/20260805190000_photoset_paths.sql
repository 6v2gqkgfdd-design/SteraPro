-- Volledige fotoset (studio / detail / maat) op product_enrichment

alter table public.product_enrichment
  add column if not exists detail_image_path text;

alter table public.product_enrichment
  add column if not exists maat_image_path text;

alter table public.product_enrichment
  add column if not exists photoset_generated_at timestamptz;

comment on column public.product_enrichment.detail_image_path is
  'Storage-pad detailfoto (blad/close-up), bv. detail/CC0060777.jpg';
comment on column public.product_enrichment.maat_image_path is
  'Storage-pad maatfoto met lijnen, bv. maat/CC0060777.jpg';
comment on column public.product_enrichment.photoset_generated_at is
  'Laatste automatische fotoset-run (studio+detail+maat).';

-- Job queue voor batch-optimalisatie vanuit de admin-UI
create table if not exists public.photo_optimize_jobs (
  id          uuid primary key default gen_random_uuid(),
  itemcode    text not null references public.nieuwkoop_products(itemcode) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'running', 'done', 'error', 'skipped')),
  error       text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

create index if not exists photo_optimize_jobs_status_idx
  on public.photo_optimize_jobs (status, created_at);

alter table public.photo_optimize_jobs enable row level security;

drop policy if exists "staff_manage_photo_jobs" on public.photo_optimize_jobs;
create policy "staff_manage_photo_jobs" on public.photo_optimize_jobs
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());
