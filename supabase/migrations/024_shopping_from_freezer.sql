-- Separate from_freezer flag so fridge and freezer items are distinguishable
ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS from_freezer BOOLEAN NOT NULL DEFAULT false;
