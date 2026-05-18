create materialized view public.person_groups as
with recursive patriline as (
  select
    id,
    family_name_ar  as major_group_ar,
    family_name_en  as major_group_en,
    father_id,
    0               as depth
  from public.people
  where (father_id is null
         or father_id not in (select id from public.people where deleted_at is null))
    and deleted_at is null

  union all

  select
    p.id,
    pl.major_group_ar,
    pl.major_group_en,
    p.father_id,
    pl.depth + 1
  from public.people p
  join patriline pl on p.father_id = pl.id
  where p.deleted_at is null
    and pl.depth < 30
)
select
  p.id,
  coalesce(pl.major_group_ar, p.family_name_ar)  as major_group_ar,
  coalesce(pl.major_group_en, p.family_name_en)  as major_group_en,
  case
    when fp.id is not null and p.family_name_ar is not null
         and p.family_name_ar != coalesce(fp.family_name_ar, '')
    then p.family_name_ar
    else null
  end                                             as minor_group_ar,
  case
    when fp.id is not null and p.family_name_en is not null
         and p.family_name_en != coalesce(fp.family_name_en, '')
    then p.family_name_en
    else null
  end                                             as minor_group_en
from public.people p
left join patriline pl on p.id = pl.id
left join public.people fp on p.father_id = fp.id
where p.deleted_at is null;

create unique index person_groups_id_idx on public.person_groups (id);

create or replace function public.refresh_person_groups()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.person_groups;
  return null;
end; $$;

create trigger people_refresh_groups
  after insert or update or delete on public.people
  for each statement execute function public.refresh_person_groups();
