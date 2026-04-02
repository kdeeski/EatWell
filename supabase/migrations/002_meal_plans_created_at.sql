-- Add created_at to meal_plans for consistency with all other tables.
-- Backfill existing rows from generated_at.

alter table meal_plans
  add column if not exists created_at timestamptz not null default now();

update meal_plans set created_at = generated_at where created_at = now();

create index if not exists meal_plans_created_at_idx on meal_plans(created_at);
