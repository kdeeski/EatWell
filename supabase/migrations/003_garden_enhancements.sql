-- ─── 003: Garden enhancements ─────────────────────────────────────────────────
-- Adds variety, location_note, cut-and-come-again flag, and updated_at to
-- garden_plants. Creates the garden_suggestions table.

-- New columns on garden_plants
alter table garden_plants
  add column if not exists variety               text,
  add column if not exists location_note         text,
  add column if not exists is_cut_and_come_again boolean not null default false,
  add column if not exists updated_at            timestamptz not null default now();

-- Auto-update updated_at on every write
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger garden_plants_updated_at
  before update on garden_plants
  for each row execute procedure set_updated_at();

-- New table: garden_suggestions (AI-generated, cached per user per month)
create table if not exists garden_suggestions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  plant_name        text not null,
  why_now           text not null,
  why_worth_growing text not null,
  why_suits_cooking text not null,
  month_generated   smallint not null,
  dismissed         boolean not null default false,
  added_to_garden   boolean not null default false,
  created_at        timestamptz not null default now()
);

create index on garden_suggestions(user_id);
create index on garden_suggestions(user_id, month_generated);

alter table garden_suggestions enable row level security;
create policy "garden_suggestions: own" on garden_suggestions
  for all using (auth.uid() = user_id);
