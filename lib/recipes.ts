import type { Recipe } from '../types';

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
      const stash = norm(r.name);
      if (stash.length < 5) return false;
      return meal.includes(stash) || stash.includes(meal);
    }) ?? null
  );
}
