-- Remove legacy holly_included column (replaced by household members + guests_count)
ALTER TABLE planned_meals DROP COLUMN IF EXISTS holly_included;
