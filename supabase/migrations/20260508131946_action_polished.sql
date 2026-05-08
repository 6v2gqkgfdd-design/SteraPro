-- 'Bladglans' aanvinkbaar tijdens onderhoud.
--
-- Tot nu toe was action_cleaned (= bladeren reinigen) het enige
-- bladzorg-actie. Bladglans is een aparte handeling (speciaal product
-- voor glanzend effect) en hoort bij het standaard-onderhoud, dus we
-- voegen action_polished toe.

alter table public.maintenance_visit_plants
  add column if not exists action_polished boolean default false;

-- Werk de signing-RPC bij zodat action_polished ook op het publieke
-- werkbon-document verschijnt.
create or replace function public.get_work_order_for_signing(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', wo.id,
    'status', wo.status,
    'signed_at', wo.signed_at,
    'signed_name', wo.signed_name,
    'signed_email', wo.signed_email,
    'sent_at', wo.sent_at,
    'visit', jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'scheduled_start', v.scheduled_start,
      'started_at', v.started_at,
      'ended_at', v.ended_at,
      'pause_total_minutes', v.pause_total_minutes,
      'planned_tasks', v.planned_tasks,
      'general_notes', v.general_notes
    ),
    'company', jsonb_build_object(
      'name', c.name,
      'contact_name', c.contact_name,
      'email', c.email,
      'has_maintenance_contract', coalesce(c.has_maintenance_contract, false)
    ),
    'location', jsonb_build_object(
      'name', l.name,
      'street', l.street,
      'number', l.number,
      'postal_code', l.postal_code,
      'city', l.city
    ),
    'plants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vp.id,
          'plant_id', vp.plant_id,
          'nickname', p.nickname,
          'species', p.species,
          'reference_code', p.reference_code,
          'photo_url', vp.photo_url,
          'notes', vp.notes,
          'health_status', vp.health_status,
          'action_watered', vp.action_watered,
          'action_pruned', vp.action_pruned,
          'action_fed', vp.action_fed,
          'action_cleaned', vp.action_cleaned,
          'action_rotated', vp.action_rotated,
          'action_polished', vp.action_polished,
          'action_repotted', vp.action_repotted,
          'action_replaced', vp.action_replaced,
          'action_checked', vp.action_checked,
          'followup_replace', vp.followup_replace,
          'replacement_light_level', vp.replacement_light_level,
          'replacement_height_cm', vp.replacement_height_cm,
          'replacement_pot_diameter_cm', vp.replacement_pot_diameter_cm,
          'replacement_needs_outer_pot', vp.replacement_needs_outer_pot,
          'replacement_notes', vp.replacement_notes
        )
        order by vp.created_at
      )
      from public.maintenance_visit_plants vp
      left join public.plants p on p.id = vp.plant_id
      where vp.visit_id = v.id
    ), '[]'::jsonb),
    'consumables', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vc.id,
          'name', coalesce(vc.custom_name, cc.name),
          'quantity', vc.quantity,
          'unit', vc.unit,
          'notes', vc.notes
        )
        order by vc.created_at
      )
      from public.maintenance_visit_consumables vc
      left join public.consumable_catalog cc on cc.id = vc.catalog_item_id
      where vc.visit_id = v.id
    ), '[]'::jsonb)
  ) into result
  from public.work_orders wo
  join public.maintenance_visits v on v.id = wo.visit_id
  left join public.companies c on c.id = v.company_id
  left join public.locations l on l.id = v.location_id
  where wo.signing_token = _token
    and wo.status in ('sent', 'signed');

  return result;
end;
$$;
