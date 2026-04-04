-- Ad-hoc shopping list items (pantry replenish + manually added)
-- should survive meal plan regeneration. This flag lets saveShoppingList()
-- rescue them before wiping the old list.

alter table shopping_list_items
  add column if not exists is_adhoc boolean not null default false;
