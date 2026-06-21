-- Store suggestion context on garden plants (for wishlist cards)
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS suggestion_context JSONB;
