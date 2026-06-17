alter table user_preferences
  add column if not exists wine_guide_site text default 'goodpairdays.com',
  add column if not exists recipe_search_site text default 'recipetineats.com';
