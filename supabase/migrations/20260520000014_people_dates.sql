alter table public.people
  add column if not exists birth_date text,
  add column if not exists death_date text;
