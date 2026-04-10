-- Add missing columns to cooked_meals that logCookedMeal already writes
alter table cooked_meals
  add column if not exists would_cook_again boolean,
  add column if not exists notes            text;
