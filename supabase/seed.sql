-- Seed: Marcelle + immediate family
-- Safe to re-run: uses ON CONFLICT DO NOTHING.

insert into public.people (
  id, given_ar, given_en,
  father_name_ar, father_name_en,
  grandfather_name_ar, grandfather_name_en,
  family_name_ar, family_name_en,
  gender, is_placeholder
) values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'مارسيل',          'Marcelle',
  'جبالة',           'Gaballah',
  'شحاتة',           'Shahata',
  'الزواتي',         'El Zawaty',
  'f', false
) on conflict (id) do nothing;

insert into public.people (
  id, given_ar, given_en,
  family_name_ar, family_name_en,
  gender, is_placeholder
) values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  null,  null,
  null,  null,
  'm', true
) on conflict (id) do nothing;

insert into public.relationships (person_a_id, person_b_id, type, status, order_index)
select
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'spouse', 'current', 1
where not exists (
  select 1 from public.relationships
  where person_a_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and person_b_id = 'aaaaaaaa-0000-0000-0000-000000000002'
    and type = 'spouse'
);

insert into public.events (person_id, type, date_precision, source_type)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'birth', 'year', 'admin'
where not exists (
  select 1 from public.events
  where person_id = 'aaaaaaaa-0000-0000-0000-000000000001' and type = 'birth'
);

update public.settings
set focal_person_id = 'aaaaaaaa-0000-0000-0000-000000000001'
where id = 1;
