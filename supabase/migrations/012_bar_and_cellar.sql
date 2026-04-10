-- Bar inventory (spirits, liqueurs, bitters, syrups)
create table if not exists bar_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  spirit_type  text not null check (spirit_type in (
    'whiskey','cognac_brandy','gin','vodka','rum',
    'tequila_mezcal','vermouth_fortified','liqueur_aperitif',
    'bitters','syrup_mixer','other'
  )),
  abv          numeric(5,1),
  size_ml      int,
  country      text,
  quantity     numeric(6,2) not null default 1,
  notes        text,
  depleted     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on bar_items(user_id);
alter table bar_items enable row level security;
create policy "bar_items: own" on bar_items
  for all using (auth.uid() = user_id);

-- Wine cellar
create table if not exists cellar_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  producer     text,
  varietal     text,
  vintage      int,
  region       text,
  country      text,
  size_ml      int not null default 750,
  quantity     int not null default 1,
  notes        text,
  depleted     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on cellar_items(user_id);
alter table cellar_items enable row level security;
create policy "cellar_items: own" on cellar_items
  for all using (auth.uid() = user_id);
