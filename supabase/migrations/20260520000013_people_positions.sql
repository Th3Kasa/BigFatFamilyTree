alter table public.people
  add column if not exists pos_x double precision,
  add column if not exists pos_y double precision;

alter table public.profiles
  add column if not exists canvas_viewport jsonb;

comment on column public.people.pos_x is 'Canvas X position; null = use dagre layout fallback';
comment on column public.people.pos_y is 'Canvas Y position; null = use dagre layout fallback';
comment on column public.profiles.canvas_viewport is '{ x, y, zoom } last camera state per user';
