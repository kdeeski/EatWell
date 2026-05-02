-- Remove duplicates, keeping the one with the most data (longest description/method)
DELETE FROM recipes
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, lower(name)) id
  FROM recipes
  ORDER BY user_id, lower(name),
    (length(coalesce(method,'')) + length(coalesce(description,'')) + length(coalesce(ingredients,''))) DESC,
    created_at ASC
);

-- Unique index on (user_id, lower(name)) to block future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS recipes_user_id_name_unique
  ON recipes (user_id, lower(name));
