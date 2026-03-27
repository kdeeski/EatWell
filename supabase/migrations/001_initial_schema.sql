-- ─────────────────────────────────────────────────────────────────────────────
-- EatWell — Initial Schema
-- ─────────────────────────────────────────────────────────────────────────────
-- Design principles:
--   • Fridge state is DERIVED (shopping + garden - meals cooked + corrections)
--     — it is never directly edited in bulk; only appended/corrected via events
--   • Fresh items only — no dry goods / pantry staples
--   • Phase 1: single user. Phase 2: Holly added via user_roles table.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique not null,
  timezone    text not null default 'Pacific/Auckland',
  notification_time time not null default '07:00',
  created_at  timestamptz not null default now()
);

-- ─── Fridge Items ─────────────────────────────────────────────────────────────
-- Represents fresh produce and meat currently in the fridge.
-- Rows are ADDED by: shopping list confirmation, garden harvest, manual entry.
-- Rows are REDUCED by: marking a meal as cooked (ingredients deducted).
-- Rows are CORRECTED by: morning check-in fridge confirmation step.

create table if not exists fridge_items (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  name                 text not null,
  quantity             numeric not null default 1,
  unit                 text not null default 'piece',
  source               text not null check (source in ('shopping','garden','manual','market')),
  purchased_date       date not null default current_date,
  expected_expiry_date date,
  notes                text,
  created_at           timestamptz not null default now()
);

create index on fridge_items(user_id);
create index on fridge_items(expected_expiry_date);

-- ─── Garden Plants ────────────────────────────────────────────────────────────

create table if not exists garden_plants (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  plant_name           text not null,
  planted_date         date not null,
  expected_ready_date  date,
  status               text not null default 'planted'
                         check (status in ('planted','growing','ready','harvested','finished')),
  quantity_planted     integer,
  notes                text,
  created_at           timestamptz not null default now()
);

create index on garden_plants(user_id);
create index on garden_plants(expected_ready_date);
create index on garden_plants(status);

-- ─── Garden Harvests ─────────────────────────────────────────────────────────

create table if not exists garden_harvests (
  id               uuid primary key default gen_random_uuid(),
  garden_plant_id  uuid not null references garden_plants(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  harvest_date     date not null default current_date,
  quantity         numeric,
  unit             text,
  storage          text not null default 'fresh'
                     check (storage in ('fresh','frozen','preserved')),
  notes            text,
  created_at       timestamptz not null default now()
);

create index on garden_harvests(user_id);
create index on garden_harvests(harvest_date);

-- ─── Meal Plans ───────────────────────────────────────────────────────────────
-- One row per week. week_start_date is always a Monday.

create table if not exists meal_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  week_start_date  date not null,
  generated_at     timestamptz not null default now(),
  confirmed        boolean not null default false,
  notes            text,
  unique(user_id, week_start_date)
);

create index on meal_plans(user_id);
create index on meal_plans(week_start_date);

-- ─── Planned Meals ────────────────────────────────────────────────────────────
-- 7 meals per meal plan (one per day, Monday = 0).
-- ingredients stored as JSONB — structured list of PlannedIngredient objects.

create table if not exists planned_meals (
  id                      uuid primary key default gen_random_uuid(),
  meal_plan_id            uuid not null references meal_plans(id) on delete cascade,
  day_of_week             smallint not null check (day_of_week between 0 and 6),
  meal_name               text not null,
  description             text,
  is_fish                 boolean not null default false,
  needs_recipe            boolean not null default false,
  estimated_prep_minutes  integer,
  ingredients             jsonb not null default '[]',
  holly_included          boolean not null default false,
  created_at              timestamptz not null default now()
);

create index on planned_meals(meal_plan_id);

-- ─── Shopping Lists ───────────────────────────────────────────────────────────

create table if not exists shopping_lists (
  id               uuid primary key default gen_random_uuid(),
  meal_plan_id     uuid not null references meal_plans(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  week_start_date  date not null,
  created_at       timestamptz not null default now()
);

create index on shopping_lists(user_id);

-- ─── Shopping List Items ──────────────────────────────────────────────────────

create table if not exists shopping_list_items (
  id               uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  name             text not null,
  quantity         numeric not null,
  unit             text not null,
  store            text not null check (store in ('grocer','butcher','supermarket')),
  buy_timing       text not null check (buy_timing in ('weekend','day_of')),
  checked          boolean not null default false,
  meal_names       jsonb not null default '[]',  -- string array
  created_at       timestamptz not null default now()
);

create index on shopping_list_items(shopping_list_id);
create index on shopping_list_items(store, buy_timing);

-- ─── Cooked Meals Log ────────────────────────────────────────────────────────
-- Populated by the morning check-in ("what did you cook last night?").

create table if not exists cooked_meals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  cooked_date       date not null,
  planned_meal_id   uuid references planned_meals(id) on delete set null,
  actual_meal_name  text not null,
  rating            smallint check (rating between 1 and 5),
  voice_note_url    text,
  ate_out           boolean not null default false,
  created_at        timestamptz not null default now()
);

create index on cooked_meals(user_id);
create index on cooked_meals(cooked_date);

-- ─── Morning Check-ins ────────────────────────────────────────────────────────
-- One row per user per day. Tracks both the debrief (last night) and
-- the plan selection (tonight).

create table if not exists checkins (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(id) on delete cascade,
  checkin_date             date not null,
  last_night_response      jsonb,    -- { type, meal_name?, cooked_meal_id? }
  tonight_planned_meal_id  uuid references planned_meals(id) on delete set null,
  holly_joining            boolean not null default false,
  completed_at             timestamptz,
  created_at               timestamptz not null default now(),
  unique(user_id, checkin_date)
);

create index on checkins(user_id);
create index on checkins(checkin_date);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Each user can only see and modify their own data.
-- In Phase 2, Holly will be added as a second user with shared meal_plan access.

alter table users               enable row level security;
alter table fridge_items        enable row level security;
alter table garden_plants       enable row level security;
alter table garden_harvests     enable row level security;
alter table meal_plans          enable row level security;
alter table planned_meals       enable row level security;
alter table shopping_lists      enable row level security;
alter table shopping_list_items enable row level security;
alter table cooked_meals        enable row level security;
alter table checkins            enable row level security;

-- Users can only read/write their own profile
create policy "users: own row" on users
  for all using (auth.uid() = id);

-- Fridge
create policy "fridge: own items" on fridge_items
  for all using (auth.uid() = user_id);

-- Garden
create policy "garden_plants: own" on garden_plants
  for all using (auth.uid() = user_id);
create policy "garden_harvests: own" on garden_harvests
  for all using (auth.uid() = user_id);

-- Meal planning
create policy "meal_plans: own" on meal_plans
  for all using (auth.uid() = user_id);
create policy "planned_meals: via meal_plan" on planned_meals
  for all using (
    exists (
      select 1 from meal_plans mp
      where mp.id = planned_meals.meal_plan_id
        and mp.user_id = auth.uid()
    )
  );

-- Shopping
create policy "shopping_lists: own" on shopping_lists
  for all using (auth.uid() = user_id);
create policy "shopping_list_items: via list" on shopping_list_items
  for all using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and sl.user_id = auth.uid()
    )
  );

-- Log
create policy "cooked_meals: own" on cooked_meals
  for all using (auth.uid() = user_id);
create policy "checkins: own" on checkins
  for all using (auth.uid() = user_id);
