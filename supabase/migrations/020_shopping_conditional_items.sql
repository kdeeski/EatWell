alter table shopping_list_items
  add column if not exists conditional_note text,
  add column if not exists conditional_meal_ids jsonb;
