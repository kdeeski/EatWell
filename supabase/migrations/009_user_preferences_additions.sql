-- ─── 009: User preferences additions ──────────────────────────────────────────
-- Adds standing_orders (meal plan prompt context) and meal rotation settings.

alter table user_preferences
  add column if not exists standing_orders       text,
  add column if not exists rotation_repeat_ratio numeric not null default 0,
  add column if not exists rotation_min_rated    int     not null default 10;
