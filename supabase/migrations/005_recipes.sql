create table if not exists recipes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  name              text not null,
  category          text not null
                      check (category in (
                        'mains','sauces_dressings','sides',
                        'desserts','baking','marinades_rubs','glossary','component'
                      )),
  description       text,
  ingredients       text,
  method            text,
  source_url        text,
  rating            smallint check (rating between 1 and 5),
  would_cook_again  boolean,
  times_cooked      int not null default 0,
  cooked_meal_id    uuid references cooked_meals(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger recipes_updated_at before update on recipes
  for each row execute procedure set_updated_at();
create index on recipes(user_id);
create index on recipes(user_id, category);
alter table recipes enable row level security;
create policy "recipes: own" on recipes
  for all using (auth.uid() = user_id);
