-- Allow wishlist plants with no planted_date
ALTER TABLE garden_plants ALTER COLUMN planted_date DROP NOT NULL;

-- Add companion planting notes to suggestions
ALTER TABLE garden_suggestions ADD COLUMN IF NOT EXISTS companion_note TEXT;
