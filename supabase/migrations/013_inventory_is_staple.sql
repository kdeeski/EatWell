-- Add is_staple flag to inventory_items.
-- Staples are items the user always keeps on hand (butter, olive oil, eggs, etc.)
-- that should not influence meal planning choices, only shopping list cross-referencing.
alter table inventory_items
  add column if not exists is_staple boolean not null default false;
