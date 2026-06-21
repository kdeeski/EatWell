CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency_hint TEXT,
  dietary_notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own household members"
  ON household_members FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
