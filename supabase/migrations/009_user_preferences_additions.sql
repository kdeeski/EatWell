-- ─── 009: User preferences additions ──────────────────────────────────────────
-- Adds standing_orders, meal rotation settings, and wine detail level.

alter table user_preferences
  add column if not exists standing_orders       text,
  add column if not exists rotation_repeat_ratio numeric not null default 0,
  add column if not exists rotation_min_rated    int     not null default 10,
  add column if not exists wine_detail_level     text    not null default 'simple';
