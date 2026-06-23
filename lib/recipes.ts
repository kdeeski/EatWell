import type { Recipe, ItemCategory } from '../types';

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

/**
 * Herbs where the bare name implies fresh leaves.
 * "rosemary" → "fresh rosemary", unless already qualified
 * (e.g. "dried rosemary", "fresh thyme").
 */
const FRESH_BY_DEFAULT = new Set([
  'basil', 'parsley', 'mint', 'chives', 'dill', 'tarragon',
  'chervil', 'sage', 'thyme', 'rosemary', 'oregano', 'marjoram',
  'lemongrass', 'kaffir lime leaves',
]);

/** Ingredient aliases: vague or colloquial names → specific default */
const ALIASES: Record<string, string> = {
  'rice':         'jasmine rice',
  'risotto rice': 'arborio rice',
};

export function normaliseIngredientName(raw: string): string {
  const name = raw.toLowerCase().trim()
    .replace(/\bcanned\b/g, 'tinned'); // normalise US "canned X" → NZ/UK "tinned X"
  if (ALIASES[name]) return ALIASES[name];
  if (QUALIFIERS.test(name)) return name; // already qualified — leave it
  if (FRESH_BY_DEFAULT.has(name)) return `fresh ${name}`;
  if (GROUND_BY_DEFAULT.has(name)) return `ground ${name}`;
  return name;
}

/**
 * Fuzzy-match a name against the recipe stash.
 *
 * Default (loose) mode — for meal plan matching:
 *   Either name is a substring of the other, min 5 chars.
 *   "Shakshuka with Sourdough" matches stash "Shakshuka" ✓
 *
 * Strict mode — for shopping list matching:
 *   Only matches if the item name CONTAINS the recipe name.
 *   Prevents "lemon" matching "Baked Snapper with Lemon and Capers".
 *   "harissa paste" contains "harissa" → match ✓
 *   "lemon" does not contain "baked snapper…" → no match ✓
 */
export function findStashMatch(
  mealName: string,
  recipes: Recipe[],
  options?: { strict?: boolean }
): Recipe | null {
  const norm = (s: string) => s.toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  // Words too generic to drive a match on their own
  const STOP = new Set(['with', 'and', 'the', 'for', 'from', 'over', 'onto', 'into']);
  const sigWords = (s: string): Set<string> =>
    new Set(s.split(' ').filter((w) => w.length >= 3 && !STOP.has(w)));

  const meal = norm(mealName);
  const strict = options?.strict ?? false;

  return (
    recipes.find((r) => {
      if (r.category === 'glossary') return false;
      const stash = norm(r.name);
      if (stash.length < 5) return false;

      // Primary: substring match (one name fully contains the other)
      if (strict ? meal.includes(stash) : (meal.includes(stash) || stash.includes(meal))) return true;

      // Fallback (loose mode only): significant word overlap
      // e.g. "Risotto with Roasted Feijoa" ↔ "Roasted Feijoa and Pecorino Risotto"
      if (!strict) {
        const mealWords  = sigWords(meal);
        const stashWords = sigWords(stash);
        let shared = 0;
        for (const w of mealWords) { if (stashWords.has(w)) shared++; }
        const minSize = Math.min(mealWords.size, stashWords.size);
        if (minSize >= 2 && shared >= 2 && shared / minSize >= 0.6) return true;
      }

      return false;
    }) ?? null
  );
}

// ── Ingredient parsing ────────────────────────────────────────────────────────

const MEAT_FISH   = /\b(chicken|beef|lamb|pork|fish|salmon|tuna|prawn|shrimp|bacon|sausage|mince|steak|fillet|chorizo|anchov)\b/i;
const DAIRY_EGGS  = /\b(butter|cheese|cream|milk|yogurt|yoghurt|egg|parmesan|pecorino|ricotta|feta|mozzarella|cheddar|halloumi)\b/i;
const HERBS_SPICES = /\b(cumin|paprika|coriander|turmeric|cinnamon|chilli|pepper|salt|oregano|thyme|rosemary|bay|cardamom|clove|nutmeg|saffron|sumac|harissa powder|za.atar|allspice|ginger|fenugreek|mace|cayenne|mustard seed)\b/i;
const OILS_VINEGARS = /\b(oil|vinegar|olive oil|sesame oil)\b/i;
const CONDIMENTS  = /\b(harissa|tahini|soy sauce|fish sauce|oyster sauce|miso|worcestershire|hot sauce|ketchup|mustard|mayo|paste|preserve)\b/i;
const PRODUCE     = /\b(onion|garlic|tomato|lemon|lime|orange|carrot|celery|potato|spinach|kale|mushroom|capsicum|pepper|zucchini|eggplant|avocado|cucumber|lettuce|cabbage|broccoli|cauliflower|asparagus|leek|shallot|ginger root|chilli|feijoa|apple|pear|mango|peach|plum)\b/i;
const BREAD       = /\b(bread|sourdough|pitta|pita|naan|tortilla|flatbread|couscous|breadcrumb)\b/i;
const DRY_GOODS   = /\b(flour|sugar|rice|pasta|lentil|chickpea|bean|stock|broth|coconut milk|can|tin|honey|syrup|oat|quinoa|semolina|cornflour|baking)\b/i;

function guessCategory(name: string): ItemCategory {
  if (MEAT_FISH.test(name))    return 'meat_fish';
  if (DAIRY_EGGS.test(name))   return 'dairy_eggs';
  if (HERBS_SPICES.test(name)) return 'herbs_spices';
  if (PRODUCE.test(name))      return 'produce';
  if (BREAD.test(name))        return 'pantry_dry_goods';
  if (OILS_VINEGARS.test(name)) return 'oils_vinegars';
  if (CONDIMENTS.test(name))   return 'condiments_sauces';
  if (DRY_GOODS.test(name))    return 'pantry_dry_goods';
  return 'pantry_dry_goods';
}

/**
 * Parse a free-text ingredients block (one ingredient per line) into
 * structured { name, category } items suitable for the shopping list.
 *
 * "150g Chicken Thighs, boneless"  →  { name: "chicken thighs", category: "meat_fish" }
 * "2 cloves Garlic"                →  { name: "garlic", category: "produce" }
 * "3 tbsp Olive Oil"               →  { name: "olive oil", category: "oils_vinegars" }
 */
export function parseRecipeIngredients(text: string): { name: string; category: ItemCategory }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Strip leading quantity + unit:  "150g", "2 cloves", "3 tbsp", "½ tsp" etc.
      const withoutQty = line
        .replace(/^[\d¼½¾⅓⅔.,\/\s]+/, '')          // leading numbers/fractions
        .replace(/^(g|kg|ml|l|tsp|tbsp|cup|clove[s]?|slice[s]?|sprig[s]?|bunch|handful|pinch|dash|piece[s]?|head|stalk[s]?|sheet[s]?)\s+/i, '')
        .replace(/,.*$/, '')                         // strip trailing notes
        .trim();
      const name = normaliseIngredientName(withoutQty.toLowerCase());
      return { name, category: guessCategory(name) };
    })
    .filter(({ name }) => name.length > 1);
}
