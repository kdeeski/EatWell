alter table cooked_meals
  add column if not exists drink_name  text,
  add column if not exists drink_notes text;
