-- Add 'cocktails' to the recipes category constraint
alter table recipes drop constraint if exists recipes_category_check;
alter table recipes add constraint recipes_category_check
  check (category in (
    'mains','sauces_dressings','sides',
    'desserts','baking','marinades_rubs','glossary','component','cocktails'
  ));
