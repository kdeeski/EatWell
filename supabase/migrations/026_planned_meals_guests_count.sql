-- Add guests_count column to planned_meals (replaces holly_included)
ALTER TABLE planned_meals ADD COLUMN IF NOT EXISTS guests_count INTEGER NOT NULL DEFAULT 0;
