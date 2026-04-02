-- ─── 004: User preferences ────────────────────────────────────────────────────
-- Stores meal planning and cooking preferences that feed into AI prompts.

create table if not exists user_preferences (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  cuisine_likes         text[] not null default '{}',
  cuisine_dislikes      text[] not null default '{}',
  proteins_excluded     text[] not null default '{}',
  spice_level           text not null default 'medium',  -- mild | medium | bold
  weeknight_max_minutes int  not null default 45,        -- 30 | 45 | 60
  weekend_cooking       text not null default 'project', -- quick | project
  holly_joins_regularly boolean not null default true,
  cooking_notes         text,
  garden_location       text not null default 'Canterbury, New Zealand',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id)
);

create trigger user_preferences_updated_at
  before update on user_preferences
  for each row execute procedure set_updated_at();

alter table user_preferences enable row level security;
create policy "user_preferences: own" on user_preferences
  for all using (auth.uid() = user_id);
