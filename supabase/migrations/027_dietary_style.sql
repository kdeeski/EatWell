ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS dietary_style TEXT NOT NULL DEFAULT 'omnivore';
