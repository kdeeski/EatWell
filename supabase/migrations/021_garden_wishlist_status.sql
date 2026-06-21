-- Allow wishlist plants with no planted_date
ALTER TABLE garden_plants ALTER COLUMN planted_date DROP NOT NULL;

-- Add 'wishlist' to the status check constraint
ALTER TABLE garden_plants DROP CONSTRAINT IF EXISTS garden_plants_status_check;
ALTER TABLE garden_plants ADD CONSTRAINT garden_plants_status_check
  CHECK (status IN ('planted','growing','ready','harvested','finished','wishlist'));

-- Add companion planting notes to suggestions
ALTER TABLE garden_suggestions ADD COLUMN IF NOT EXISTS companion_note TEXT;
