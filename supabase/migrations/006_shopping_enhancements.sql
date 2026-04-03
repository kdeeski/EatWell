-- ─── 006: Shopping list enhancements ──────────────────────────────────────────
-- Adds liquor_store to shopping_list_items.store constraint.
-- The beverages and alcohol ingredient_category values have no DB constraint
-- (ingredient_category is a free text column validated at the app layer).

alter table shopping_list_items
  drop constraint if exists shopping_list_items_store_check;

alter table shopping_list_items
  add constraint shopping_list_items_store_check
    check (store in ('grocer', 'butcher', 'supermarket', 'liquor_store'));
