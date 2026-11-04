alter table inventory_items
  add column if not exists use_up boolean not null default false;
