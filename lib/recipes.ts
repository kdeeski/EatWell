import type { Recipe } from '../types';

/**
 * Spices where the bare name implies the ground form.
 * "cumin" → "ground cumin", unless already qualified
 * (e.g. "cumin seeds", "whole cumin", "fresh coriander").
 */
const GROUND_BY_DEFAULT = new Set([
  'cumin', 'cinnamon', 'coriander', 'turmeric', 'cardamom',
  'nutmeg', 'allspice', 'ginger', 'cloves', 'paprika',
  'fenugreek', 'mace',
]);

const QUALIFIERS = /\b(ground|whole|fresh|dried|seeds?|flakes?|crushed|smoked)\b/i;

export function normaliseIngredientName(raw: string): string {
  const name = raw.toLowerCase().trim();
  if (QUALIFIERS.test(name)) return name; // already qualified — leave it
  if (GROUND_BY_DEFAULT.has(name)) return `ground ${name}`;
  return name;
}

/**
 * Fuzzy-match a planned meal name against the recipe stash.
 * A match is found if either name (normalised) is a substring of the other,
 * and the shorter of the two is at least 5 characters.
 *
 * Examples:
 *   "Shakshuka" (stash) ↔ "Shakshuka with Sourdough" (plan) → match
 *   "Pulled Pork" (stash) ↔ "Pulled Pork with Coleslaw" (plan) → match
 *   "Pasta" (stash) ↔ "Chicken Pasta Bake" (plan) → no match (too short/generic)
 */
export function findStashMatch(mealName: string, recipes: Recipe[]): Recipe | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const meal = norm(mealName);
  return (
    recipes.find((r) => {
      if (r.category === 'glossary') return false;
      const stash = norm(r.name);
      if (stash.length < 5) return false;
      return meal.includes(stash) || stash.includes(meal);
    }) ?? null
  );
}
