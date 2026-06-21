// ─────────────────────────────────────────────────────────────────────────────
// EatWell — Supabase data service
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { toTitleCase } from './titleCase';

// Returns YYYY-MM-DD in the device's local timezone (not UTC).
// toISOString() is UTC and gives the wrong date for NZ users in the morning.
export function localDateString(date: Date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
import { normaliseIngredientName } from './recipes';
import type {
  GardenPlant, GardenHarvest, GardenSuggestion,
  MealPlan, PlannedMeal, ShoppingList, ShoppingListItem,
  CookedMeal, CheckIn,
  InventoryItem, ItemCategory, ItemLocation, Store,
  UserPreferences, Recipe,
  BarItem, CellarItem,
  HouseholdMember,
} from '../types';
import type { GeneratedMealPlan } from './claude';

// ─── Inventory ────────────────────────────────────────────────────────────────

export async function loadInventoryItems(userId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('depleted', false)
    .order('name');
  if (error) throw error;
  return data as InventoryItem[];
}

export async function upsertInventoryItem(
  item: Omit<InventoryItem, 'id' | 'created_at'> & { id?: string }
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .upsert(item, { onConflict: 'user_id,name,location' })
    .select()
    .single();
  if (error) throw error;
  return data as InventoryItem;
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<Pick<InventoryItem, 'name' | 'quantity' | 'unit' | 'min_quantity' | 'notes' | 'depleted' | 'category' | 'location' | 'is_staple'>>
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as InventoryItem;
}

export async function removeInventoryItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ depleted: true })
    .eq('id', id);
  if (error) throw error;
}

export async function saveStocktakeItems(
  userId: string,
  items: { name: string; category: ItemCategory; location: ItemLocation; notes: string | null }[]
): Promise<InventoryItem[]> {
  const date = new Date().toISOString().split('T')[0];
  const rows = items.map((i) => ({
    user_id: userId,
    name: i.name.trim(),
    category: i.category,
    location: i.location,
    quantity: 1,
    unit: 'piece',
    min_quantity: 0,
    notes: i.notes,
    added_date: date,
    depleted: false,
  }));
  const { data, error } = await supabase
    .from('inventory_items')
    .upsert(rows, { onConflict: 'user_id,name,location' })
    .select();
  if (error) throw error;
  return data as InventoryItem[];
}

// ─── getMissingIngredients — compare recipe needs against current inventory ───

export function getMissingIngredients(
  recipeIngredients: { name: string; quantity: number; unit: string }[],
  inventoryItems: InventoryItem[]
): { name: string; quantity: number; unit: string }[] {
  return recipeIngredients.filter((ingredient) => {
    const matches = inventoryItems.filter(
      (item) =>
        item.name.toLowerCase().trim() === ingredient.name.toLowerCase().trim() &&
        !item.depleted
    );
    const totalQty = matches.reduce((sum, item) => sum + item.quantity, 0);
    return totalQty < ingredient.quantity;
  });
}

// ─── Garden ───────────────────────────────────────────────────────────────────

export async function loadGardenPlants(userId: string): Promise<GardenPlant[]> {
  const { data, error } = await supabase
    .from('garden_plants')
    .select('*')
    .eq('user_id', userId)
    .order('planted_date', { ascending: false });
  if (error) throw error;
  return data as GardenPlant[];
}

export async function addGardenPlant(
  plant: Omit<GardenPlant, 'id' | 'created_at' | 'updated_at'>
): Promise<GardenPlant> {
  const { data, error } = await supabase
    .from('garden_plants')
    .insert(plant)
    .select()
    .single();
  if (error) throw error;
  return data as GardenPlant;
}

export async function updateGardenPlantStatus(
  id: string,
  status: GardenPlant['status']
): Promise<GardenPlant> {
  const { data, error } = await supabase
    .from('garden_plants')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as GardenPlant;
}

export async function recordHarvest(
  harvest: Omit<GardenHarvest, 'id' | 'created_at'>
): Promise<GardenHarvest> {
  const { data, error } = await supabase
    .from('garden_harvests')
    .insert(harvest)
    .select()
    .single();
  if (error) throw error;
  return data as GardenHarvest;
}

export async function deleteGardenPlant(id: string): Promise<void> {
  const { error } = await supabase
    .from('garden_plants')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function updateGardenPlant(
  id: string,
  updates: Partial<Omit<GardenPlant, 'id' | 'user_id' | 'created_at'>>
): Promise<GardenPlant> {
  const { data, error } = await supabase
    .from('garden_plants')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as GardenPlant;
}

export async function loadGardenHarvestsForPlant(plantId: string): Promise<GardenHarvest[]> {
  const { data, error } = await supabase
    .from('garden_harvests')
    .select('*')
    .eq('garden_plant_id', plantId)
    .order('harvest_date', { ascending: false });
  if (error) throw error;
  return data as GardenHarvest[];
}

export async function loadGardenSuggestions(userId: string): Promise<GardenSuggestion[]> {
  const { data, error } = await supabase
    .from('garden_suggestions')
    .select('*')
    .eq('user_id', userId)
    .eq('dismissed', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as GardenSuggestion[];
}

export async function saveGardenSuggestions(
  userId: string,
  suggestions: Array<{
    plant_name: string;
    why_now: string;
    why_worth_growing: string;
    why_suits_cooking: string;
    soil_notes?: string | null;
    sun_notes?: string | null;
    companion_note?: string | null;
    month_generated: number;
  }>
): Promise<GardenSuggestion[]> {
  // Clear old non-dismissed suggestions before inserting fresh ones to prevent duplicates
  await supabase
    .from('garden_suggestions')
    .delete()
    .eq('user_id', userId)
    .eq('dismissed', false)
    .eq('added_to_garden', false);

  const rows = suggestions.map((s) => ({ ...s, user_id: userId }));
  const { data, error } = await supabase
    .from('garden_suggestions')
    .insert(rows)
    .select();
  if (error) throw error;
  return data as GardenSuggestion[];
}

export async function dismissGardenSuggestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('garden_suggestions')
    .update({ dismissed: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markSuggestionAddedToGarden(id: string): Promise<void> {
  const { error } = await supabase
    .from('garden_suggestions')
    .update({ added_to_garden: true })
    .eq('id', id);
  if (error) throw error;
}

// ─── Meal Plans ───────────────────────────────────────────────────────────────

export function getThisWeekMonday(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export async function loadMealPlanForWeek(
  userId: string,
  weekStartDate: string
): Promise<{ plan: MealPlan; meals: PlannedMeal[] } | null> {
  const { data: plans, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', weekStartDate)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!plans || plans.length === 0) return null;
  const plan = plans[0] as MealPlan;
  const { data: meals, error: mealsError } = await supabase
    .from('planned_meals')
    .select('*')
    .eq('meal_plan_id', plan.id)
    .order('day_of_week');
  if (mealsError) throw mealsError;
  return { plan, meals: (meals ?? []) as PlannedMeal[] };
}

export async function loadCurrentMealPlan(
  userId: string
): Promise<{ plan: MealPlan; meals: PlannedMeal[] } | null> {
  // Prefer this week's plan; fall back to most recent if none exists yet.
  const thisWeekPlan = await loadMealPlanForWeek(userId, getThisWeekMonday());
  if (thisWeekPlan) {
    console.log(`loadCurrentMealPlan: plan ${thisWeekPlan.plan.id} (${thisWeekPlan.plan.week_start_date}), ${thisWeekPlan.meals.length} meals`);
    return thisWeekPlan;
  }

  // Fallback: most recently created plan that is NOT in the future.
  // This prevents a future-week plan (generated for next week on a Sunday) from
  // being displayed as "this week" when there is no current-week plan yet.
  const thisMonday = getThisWeekMonday();
  const { data: plans, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .lte('week_start_date', thisMonday)
    .order('week_start_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (planError) throw planError;
  if (!plans || plans.length === 0) return null;

  const plan = plans[0] as MealPlan;

  const { data: meals, error: mealsError } = await supabase
    .from('planned_meals')
    .select('*')
    .eq('meal_plan_id', plan.id)
    .order('day_of_week');

  if (mealsError) throw mealsError;
  console.log(`loadCurrentMealPlan: plan ${plan.id} (${plan.week_start_date}), ${meals?.length ?? 0} meals`);
  return { plan, meals: (meals ?? []) as PlannedMeal[] };
}

export async function saveMealPlan(
  userId: string,
  weekStartDate: string,
  generated: GeneratedMealPlan,
  lockedDays: number[] = []
): Promise<{ plan: MealPlan; meals: PlannedMeal[] }> {
  // Upsert the plan row, then fetch separately — combined upsert+select
  // can return empty if the conflict row had no columns to update.
  const { error: upsertError } = await supabase
    .from('meal_plans')
    .upsert(
      { user_id: userId, week_start_date: weekStartDate, confirmed: true },
      { onConflict: 'user_id,week_start_date' }
    );
  if (upsertError) throw upsertError;

  const { data: plan, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', weekStartDate)
    .single();
  if (planError) throw planError;

  if (lockedDays.length === 0) {
    // Full replan — wipe all planned_meals
    await supabase.from('planned_meals').delete().eq('meal_plan_id', plan.id);
  } else {
    // Partial replan — clear every non-locked day so old meals can't survive
    // even if Claude skipped a slot. Locked days (cooked or pinned) are preserved,
    // keeping their planned_meal rows and cooked_meals.planned_meal_id FK links.
    const { data: existingMeals } = await supabase
      .from('planned_meals')
      .select('id, day_of_week')
      .eq('meal_plan_id', plan.id);
    const idsToDelete = ((existingMeals ?? []) as { id: string; day_of_week: number }[])
      .filter((m) => !lockedDays.includes(m.day_of_week))
      .map((m) => m.id);
    if (idsToDelete.length > 0) {
      await supabase.from('planned_meals').delete().in('id', idsToDelete);
    }
  }

  const mealsToInsert = generated.meals.map((m) => ({
    meal_plan_id: plan.id,
    day_of_week: Math.max(0, Math.min(6, Math.round(Number(m.day_of_week)))),
    meal_name: m.meal_name,
    description: m.description,
    is_fish: m.is_fish,
    needs_recipe: m.needs_recipe,
    estimated_prep_minutes: m.estimated_prep_minutes,
    ingredients: m.ingredients,
    holly_included: m.holly_included ?? ((m as any).guests_count > 0),
    guests_count: (m as any).guests_count ?? 0,
  }));

  if (mealsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('planned_meals').insert(mealsToInsert);
    if (insertError) throw insertError;
  }

  // Always fetch the full plan — partial replans preserve locked-day rows so
  // the return value must include both new and pre-existing meals.
  const { data: allMeals, error: mealsError } = await supabase
    .from('planned_meals')
    .select('*')
    .eq('meal_plan_id', plan.id)
    .order('day_of_week');
  if (mealsError) throw mealsError;

  return { plan: plan as MealPlan, meals: (allMeals ?? []) as PlannedMeal[] };
}

// Add a single meal into another week's plan without running the full AI wizard.
// Replaces that day slot if already occupied; creates the meal_plan row if needed.
export async function pushMealToNextWeek(
  userId: string,
  meal: PlannedMeal,
  nextWeekStart: string
): Promise<{ plan: MealPlan; meals: PlannedMeal[] }> {
  const { error: upsertError } = await supabase
    .from('meal_plans')
    .upsert(
      { user_id: userId, week_start_date: nextWeekStart, confirmed: true },
      { onConflict: 'user_id,week_start_date' }
    );
  if (upsertError) throw upsertError;

  const { data: plan, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', nextWeekStart)
    .single();
  if (planError) throw planError;

  // Remove duplicate meal name if it already exists in the target week
  await supabase
    .from('planned_meals')
    .delete()
    .eq('meal_plan_id', plan.id)
    .eq('meal_name', meal.meal_name);

  // Clear the target day slot so we can insert cleanly
  await supabase
    .from('planned_meals')
    .delete()
    .eq('meal_plan_id', plan.id)
    .eq('day_of_week', meal.day_of_week);

  await supabase.from('planned_meals').insert({
    meal_plan_id:           plan.id,
    day_of_week:            meal.day_of_week,
    meal_name:              meal.meal_name,
    description:            meal.description,
    is_fish:                meal.is_fish,
    needs_recipe:           meal.needs_recipe,
    estimated_prep_minutes: meal.estimated_prep_minutes,
    ingredients:            meal.ingredients,
    holly_included:         meal.holly_included,
  });

  const { data: meals, error: mealsError } = await supabase
    .from('planned_meals')
    .select('*')
    .eq('meal_plan_id', plan.id)
    .order('day_of_week');
  if (mealsError) throw mealsError;

  return { plan: plan as MealPlan, meals: meals as PlannedMeal[] };
}

export async function reorderPlannedMeals(
  _mealPlanId: string,
  _originalIds: string[],
  meals: PlannedMeal[]
): Promise<PlannedMeal[]> {
  // UPDATE day_of_week in-place, preserving UUIDs.
  // Critical: INSERT+DELETE would null out cooked_meals.planned_meal_id FKs (ON DELETE SET NULL),
  // breaking the cooked-meal lock UI. Updating in-place keeps the FKs intact.
  for (const m of meals) {
    const { error } = await supabase
      .from('planned_meals')
      .update({ day_of_week: m.day_of_week })
      .eq('id', m.id);
    if (error) throw error;
  }
  return meals;
}

// ─── Shopping List ────────────────────────────────────────────────────────────

export async function loadShoppingList(
  userId: string
): Promise<{ list: ShoppingList; items: ShoppingListItem[] } | null> {
  const { data: list, error: listError } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (listError || !list) return null;

  const { data: items, error: itemsError } = await supabase
    .from('shopping_list_items')
    .select('*')
    .eq('shopping_list_id', list.id)
    .order('store')
    .order('buy_timing');

  if (itemsError) throw itemsError;
  return { list: list as ShoppingList, items: items as ShoppingListItem[] };
}

function normalizeStore(raw: string): Store {
  const s = (raw ?? '').toLowerCase();
  if (s === 'butcher' || s.includes('butch') || s.includes('meat')) return 'butcher';
  if (s === 'grocer' || s.includes('grocer') || s.includes('market') || s.includes('farm') || s.includes('fish')) return 'grocer';
  if (s === 'liquor_store' || s.includes('liquor') || s.includes('bottle') || s.includes('wine') || s.includes('beer')) return 'liquor_store';
  return 'supermarket';
}

function normalizeBuyTiming(raw: string): 'weekend' | 'day_of' {
  if (raw === 'weekend') return 'weekend';
  return 'day_of';
}

function normalizeCategory(raw: string): ItemCategory {
  const s = (raw ?? '').toLowerCase().replace(/-/g, '_');
  const valid = [
    'meat_fish','dairy_eggs','produce','bread_bakery',
    'pantry_dry_goods','herbs_spices','cans_preserves',
    'oils_vinegars','condiments_sauces','beverages','alcohol','household',
  ];
  // Legacy mapping
  if (s === 'fresh_herbs') return 'herbs_spices';
  if (s === 'meat_and_fish' || s === 'meat & fish') return 'meat_fish';
  if (valid.includes(s)) return s as ItemCategory;
  return 'pantry_dry_goods';
}

export interface EarmarkedIngredient {
  ingredient_name: string;
  meal_name: string;
  meal_id: string;
}

export async function saveShoppingList(
  userId: string,
  mealPlanId: string,
  weekStartDate: string,
  generated: GeneratedMealPlan,
  knownItems?: { fridge: string[]; pantry: string[] },
  earmarkedItems?: EarmarkedIngredient[]
): Promise<{ list: ShoppingList; items: ShoppingListItem[] }> {
  // Rescue any ad-hoc items before wiping the old list
  const { data: existingLists } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('meal_plan_id', mealPlanId);

  type AdhocRow = Omit<ShoppingListItem, 'id' | 'created_at' | 'shopping_list_id'>;
  let adhocItems: AdhocRow[] = [];

  if (existingLists?.length) {
    const { data: oldAdhoc } = await supabase
      .from('shopping_list_items')
      .select('*')
      .in('shopping_list_id', existingLists.map((l) => l.id))
      .eq('is_adhoc', true);
    adhocItems = (oldAdhoc ?? []).map(({ id, created_at, shopping_list_id, ...rest }) => rest as AdhocRow);

    await supabase
      .from('shopping_list_items')
      .delete()
      .in('shopping_list_id', existingLists.map((l) => l.id));
    await supabase.from('shopping_lists').delete().eq('meal_plan_id', mealPlanId);
  }

  const { data: list, error: listError } = await supabase
    .from('shopping_lists')
    .insert({ user_id: userId, meal_plan_id: mealPlanId, week_start_date: weekStartDate })
    .select()
    .single();
  if (listError) throw listError;

  // Items too universal to buy — available at tap/from kitchen basics
  const SKIP_INGREDIENTS = new Set([
    'water', 'salt', 'pepper', 'black pepper', 'white pepper', 'sea salt',
    'table salt', 'rock salt', 'salt and pepper', 'ground black pepper',
    'ground pepper', 'cracked pepper', 'freshly ground pepper',
  ]);

  // AI artefact words that indicate a vague/placeholder ingredient name
  const AI_ARTEFACT = /^(which|any|your choice|optional|to taste|as needed|to serve|for serving|garnish)/i;

  // Names that are clearly meat/fish regardless of what category Claude assigned
  const FORCE_MEAT_FISH = /\b(fillet|steak|breast|thigh|mince|chicken|beef|lamb|pork|salmon|tuna|snapper|barramundi|cod|hake|prawn|shrimp|scallop|mussel|squid|octopus|anchov|sardine|mackerel|trout|bream|flathead|whiting)\b/i;

  // Ingredients Claude sometimes miscategorises as produce instead of herbs_spices:
  // ground/dried/smoked prefix, OR fresh + a known herb name (NOT "fresh pasta" etc.)
  const FORCE_HERBS_SPICES = /^(ground|smoked)\s+(cumin|coriander|turmeric|cardamom|nutmeg|allspice|paprika|fenugreek|mace|ginger|cinnamon|cloves?|black pepper|white pepper|chilli|chili)\b|^dried\s+(basil|parsley|mint|chives|dill|tarragon|chervil|sage|thyme|rosemary|oregano|marjoram|lemongrass|coriander|cilantro|bay\s+leaves?|mixed\s+herbs?|chilli|chili)\b|^fresh\s+(basil|parsley|mint|chives|dill|tarragon|chervil|sage|thyme|rosemary|oregano|marjoram|lemongrass|coriander|cilantro|kaffir|bay\s+leaf|bay\s+leaves)\b|^(cumin|coriander|turmeric|cardamom|nutmeg|allspice|paprika|fenugreek|mace|chilli|chili|ginger|cinnamon|sumac|star anise|fennel seeds|mustard seeds|caraway seeds|ras el hanout|za'atar|harissa|cloves|bay leaves|bay leaf|mixed spice|five spice|curry powder|garam masala|cajun seasoning|chinese five spice)$/i;

  // Singular forms for common produce plurals — prevents "Carrot" and "Carrots"
  // from appearing as two separate line items
  const SINGULAR: Record<string, string> = {
    carrots: 'carrot', onions: 'onion', mushrooms: 'mushroom',
    potatoes: 'potato', tomatoes: 'tomato', lemons: 'lemon',
    limes: 'lime', oranges: 'orange', shallots: 'shallot',
    courgettes: 'courgette', zucchinis: 'zucchini', capsicums: 'capsicum',
    eggplants: 'eggplant', parsnips: 'parsnip', beetroots: 'beetroot',
    leeks: 'leek', turnips: 'turnip', radishes: 'radish',
    cloves: 'clove', sprigs: 'sprig', stalks: 'stalk', slices: 'slice',
  };
  const dedupeKey = (name: string): string => SINGULAR[name] ?? name;

  const itemMap = new Map<string, ShoppingListItem>();

  for (const meal of generated.meals) {
    for (const ing of meal.ingredients) {
      if (ing.from_garden && ing.ingredient_category !== 'herbs_spices') continue;

      // Normalise name for deduplication so "egg" and "eggs" (or any case variant) merge,
      // and bare spice names resolve to their ground form ("cumin" → "ground cumin")
      const normName = normaliseIngredientName(ing.name.toLowerCase().trim());
      if (SKIP_INGREDIENTS.has(normName)) continue;
      if (AI_ARTEFACT.test(normName)) continue;

      // Override obviously wrong categories from Claude
      let cat = normalizeCategory(ing.ingredient_category ?? 'produce');
      if (FORCE_MEAT_FISH.test(normName)) cat = 'meat_fish';
      else if (FORCE_HERBS_SPICES.test(normName)) cat = 'herbs_spices';

      // Key by singular form so "Carrot" and "Carrots" merge into one line item
      const key = dedupeKey(normName);

      const alreadyHave = (ing.from_fridge ?? false) || (ing.from_freezer ?? false);

      if (itemMap.has(key)) {
        const existing = itemMap.get(key)!;
        existing.quantity += ing.quantity;
        (existing.meal_names as string[]).push(meal.meal_name);
        if (!alreadyHave) existing.checked = false;
      } else {
        itemMap.set(key, {
          id: '',
          shopping_list_id: list.id,
          name: normName,
          quantity: ing.quantity,
          unit: ing.unit,
          store: normalizeStore(ing.store),
          buy_timing: normalizeBuyTiming(ing.buy_timing),
          checked: alreadyHave,
          is_pantry_staple: ing.is_pantry_staple ?? false,
          from_fridge: ing.from_fridge ?? false,
          from_freezer: ing.from_freezer ?? false,
          from_garden: ing.from_garden ?? false,
          ingredient_category: cat,
          herb_backup: ing.herb_backup ?? null,
          meal_names: [meal.meal_name],
          is_adhoc: false,
          conditional_note: null,
          conditional_meal_ids: null,
          created_at: '',
        });
      }
    }
  }

  // Cross-reference against the user's actual inventory to fix missed from_fridge /
  // is_pantry_staple flags from Claude. Uses substring matching so "mushrooms" in
  // inventory matches "button mushrooms" or "sliced mushrooms" from Claude.
  if (knownItems) {
    const normFridge  = knownItems.fridge.map((n) => normaliseIngredientName(n.toLowerCase().trim()));
    const normPantry  = knownItems.pantry.map((n) => normaliseIngredientName(n.toLowerCase().trim()));
    const fuzzyMatch  = (inventory: string[], itemName: string) =>
      inventory.some((inv) => inv.length >= 3 && (inv.includes(itemName) || itemName.includes(inv)));

    for (const item of itemMap.values()) {
      if (item.from_fridge || item.from_freezer) continue;
      if (fuzzyMatch(normFridge, item.name)) {
        item.from_fridge = true;
        item.checked     = true;
      } else if (fuzzyMatch(normPantry, item.name)) {
        // Promote to pantry staple if Claude missed it, and pre-check regardless —
        // the user has this in inventory so "Have it" should already be ticked.
        if (!item.is_pantry_staple) item.is_pantry_staple = true;
        item.checked = true;
      }
    }
  }

  // Cross-reference earmarked items: ingredients from this week's uncooked meals
  // that overlap with what the user has on hand. These are "conditional" — the user
  // might need to buy them if they cook this week's meal first.
  if (earmarkedItems && earmarkedItems.length > 0) {
    const normEarmarked = earmarkedItems.map((e) => ({
      ...e,
      norm: normaliseIngredientName(e.ingredient_name.toLowerCase().trim()),
    }));

    for (const item of itemMap.values()) {
      if (!item.from_fridge && !item.from_freezer && !item.is_pantry_staple) continue;
      const matches = normEarmarked.filter((e) => {
        if (e.norm === item.name) return true;
        if (e.norm.length < 3 || item.name.length < 3) return false;
        return e.norm.includes(item.name) || item.name.includes(e.norm);
      });
      if (matches.length > 0) {
        const mealNames = [...new Set(matches.map((m) => m.meal_name))];
        const mealIds = [...new Set(matches.map((m) => m.meal_id))];
        item.conditional_note = `Earmarked for ${mealNames.join(', ')} this week — may need to buy`;
        item.conditional_meal_ids = mealIds;
      }
    }
  }

  const itemsToInsert = Array.from(itemMap.values()).map(({ id, created_at, ...rest }) => rest);

  const { data: planItems, error: itemsError } = await supabase
    .from('shopping_list_items')
    .insert(itemsToInsert)
    .select();
  if (itemsError) throw itemsError;

  // Re-insert ad-hoc items, skipping any whose name matches a newly generated item
  const newItemNames = new Set(
    Array.from(itemMap.keys()).map((k) => k.split('__')[0])
  );
  const adhocToReinsert = adhocItems.filter(
    (i) => !newItemNames.has(i.name.toLowerCase().trim())
  );

  let reinsertedItems: ShoppingListItem[] = [];
  if (adhocToReinsert.length > 0) {
    const { data: reinserted, error: reinsertError } = await supabase
      .from('shopping_list_items')
      .insert(adhocToReinsert.map((i) => ({ ...i, shopping_list_id: list.id, checked: false })))
      .select();
    if (reinsertError) throw reinsertError;
    reinsertedItems = (reinserted ?? []) as ShoppingListItem[];
  }

  return {
    list: list as ShoppingList,
    items: [...(planItems as ShoppingListItem[]), ...reinsertedItems],
  };
}

export async function refreshConditionalItems(
  userId: string,
  items: ShoppingListItem[]
): Promise<{ updatedIds: string[]; summaries: string[] }> {
  const conditionalItems = items.filter(
    (i) => i.conditional_meal_ids && i.conditional_meal_ids.length > 0
  );
  if (conditionalItems.length === 0) return { updatedIds: [], summaries: [] };

  const allMealIds = [...new Set(conditionalItems.flatMap((i) => i.conditional_meal_ids!))];
  const { data: cookedRows } = await supabase
    .from('cooked_meals')
    .select('planned_meal_id')
    .eq('user_id', userId)
    .in('planned_meal_id', allMealIds);

  const cookedMealIds = new Set((cookedRows ?? []).map((r) => r.planned_meal_id).filter(Boolean));
  if (cookedMealIds.size === 0) return { updatedIds: [], summaries: [] };

  const updatedIds: string[] = [];
  const summaries: string[] = [];

  for (const item of conditionalItems) {
    const allCooked = item.conditional_meal_ids!.every((id) => cookedMealIds.has(id));
    if (!allCooked) continue;

    await supabase
      .from('shopping_list_items')
      .update({
        from_fridge: false,
        from_freezer: false,
        is_pantry_staple: false,
        checked: false,
        conditional_note: null,
        conditional_meal_ids: null,
      })
      .eq('id', item.id);

    updatedIds.push(item.id);
    const note = item.conditional_note?.replace(/ — may need to buy$/, '') ?? item.name;
    summaries.push(`${toTitleCase(item.name)} → need to buy (${note.toLowerCase()})`);
  }

  return { updatedIds, summaries };
}

export async function deleteShoppingItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .in('id', ids);
  if (error) throw error;
}

export async function depleteInventoryItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('inventory_items')
    .update({ depleted: true })
    .in('id', ids);
  if (error) throw error;
}

export async function toggleShoppingItemChecked(
  id: string,
  checked: boolean
): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .update({ checked })
    .eq('id', id);
  if (error) throw error;
}

export async function updateShoppingItem(
  id: string,
  updates: Partial<Pick<ShoppingListItem, 'name' | 'quantity' | 'unit' | 'store' | 'ingredient_category' | 'buy_timing'>>
): Promise<ShoppingListItem> {
  // Separate the UPDATE from the SELECT. Chaining .update().select().single()
  // can return "Cannot coerce the result to a single JSON object" on PostgREST
  // because the implicit SELECT may see all visible rows, not just the one updated.
  const { error: updateError } = await supabase
    .from('shopping_list_items')
    .update(updates)
    .eq('id', id);
  if (updateError) throw updateError;

  const { data, error: selectError } = await supabase
    .from('shopping_list_items')
    .select('*')
    .eq('id', id)
    .single();
  if (selectError) throw selectError;
  return data as ShoppingListItem;
}

export async function addAdHocShoppingItem(
  shoppingListId: string,
  name: string,
  category: ItemCategory = 'pantry_dry_goods'
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert({
      shopping_list_id: shoppingListId,
      name: name.trim(),
      quantity: 1,
      unit: 'item',
      store: category === 'meat_fish' ? 'butcher' : 'supermarket',
      buy_timing: 'weekend',
      checked: false,
      is_pantry_staple: false,
      from_fridge: false,
      from_freezer: false,
      from_garden: false,
      ingredient_category: category,
      herb_backup: null,
      meal_names: [],
      is_adhoc: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ShoppingListItem;
}

export async function addAdHocShoppingItems(
  shoppingListId: string,
  items: { name: string; category: ItemCategory }[]
): Promise<ShoppingListItem[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert(items.map((i) => ({
      shopping_list_id: shoppingListId,
      name: i.name.trim(),
      quantity: 1,
      unit: 'item',
      store: i.category === 'meat_fish' ? 'butcher' : 'supermarket',
      buy_timing: 'weekend',
      checked: false,
      is_pantry_staple: false,
      from_fridge: false,
      from_freezer: false,
      from_garden: false,
      ingredient_category: i.category,
      herb_backup: null,
      meal_names: [],
      is_adhoc: true,
    })))
    .select();
  if (error) throw error;
  return data as ShoppingListItem[];
}

// ─── Cooked Meals & Check-ins ─────────────────────────────────────────────────

export async function logCookedMeal(
  meal: Omit<CookedMeal, 'id' | 'created_at'>
): Promise<CookedMeal> {
  // Delete any existing entry for the same user/date/meal before inserting.
  // Without this, every check-in edit creates a duplicate row because the
  // check-in upserts but cooked_meals has no unique constraint to upsert on.
  const dupeQuery = supabase
    .from('cooked_meals')
    .delete()
    .eq('user_id', meal.user_id)
    .eq('cooked_date', meal.cooked_date);
  if (meal.planned_meal_id) {
    await dupeQuery.eq('planned_meal_id', meal.planned_meal_id);
  } else {
    await dupeQuery.eq('actual_meal_name', meal.actual_meal_name);
  }

  const { data, error } = await supabase
    .from('cooked_meals')
    .insert(meal)
    .select()
    .single();
  if (error) throw error;
  return data as CookedMeal;
}

export async function fetchCookedMealForPlannedMeal(
  userId: string,
  plannedMealId: string
): Promise<CookedMeal | null> {
  const { data, error } = await supabase
    .from('cooked_meals')
    .select('*')
    .eq('user_id', userId)
    .eq('planned_meal_id', plannedMealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as CookedMeal | null;
}

export async function fetchWeekCookedMeals(userId: string, weekStartDate: string): Promise<CookedMeal[]> {
  // Query by date range so results survive reorders (which used to null planned_meal_id FKs).
  const start = new Date(weekStartDate + 'T12:00:00');
  const end   = new Date(start);
  end.setDate(end.getDate() + 6);
  const endDateStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('cooked_meals')
    .select('*')
    .eq('user_id', userId)
    .gte('cooked_date', weekStartDate)
    .lte('cooked_date', endDateStr);
  if (error) throw error;
  return (data ?? []) as CookedMeal[];
}

export async function saveCheckin(
  checkin: Omit<CheckIn, 'id' | 'created_at'>
): Promise<CheckIn> {
  const { data, error } = await supabase
    .from('checkins')
    .upsert(checkin, { onConflict: 'user_id,checkin_date' })
    .select()
    .single();
  if (error) throw error;
  return data as CheckIn;
}

export async function loadTodayCheckin(
  userId: string
): Promise<CheckIn | null> {
  const today = localDateString();
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('checkin_date', today)
    .single();
  if (error) return null;
  return data as CheckIn;
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function ensureUserProfile(userId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .upsert(
      { id: userId, name: email.split('@')[0], email },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export async function loadUserPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserPreferences | null;
}

export async function saveUserPreferences(
  userId: string,
  prefs: Omit<UserPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({ ...prefs, user_id: userId }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as UserPreferences;
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

export async function loadBarItems(userId: string): Promise<BarItem[]> {
  const { data, error } = await supabase
    .from('bar_items')
    .select('*')
    .eq('user_id', userId)
    .eq('depleted', false)
    .order('name');
  if (error) throw error;
  return data as BarItem[];
}

export async function saveBarItem(
  userId: string,
  item: Omit<BarItem, 'id' | 'user_id' | 'created_at' | 'depleted'>
): Promise<BarItem> {
  const { data, error } = await supabase
    .from('bar_items')
    .insert({ ...item, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as BarItem;
}

export async function updateBarItem(id: string, updates: Partial<BarItem>): Promise<BarItem> {
  const { data, error } = await supabase
    .from('bar_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as BarItem;
}

export async function removeBarItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('bar_items')
    .update({ depleted: true })
    .eq('id', id);
  if (error) throw error;
}

// ─── Cellar ───────────────────────────────────────────────────────────────────

export async function loadCellarItems(userId: string): Promise<CellarItem[]> {
  const { data, error } = await supabase
    .from('cellar_items')
    .select('*')
    .eq('user_id', userId)
    .eq('depleted', false)
    .order('name');
  if (error) throw error;
  return data as CellarItem[];
}

export async function saveCellarItem(
  userId: string,
  item: Omit<CellarItem, 'id' | 'user_id' | 'created_at' | 'depleted'>
): Promise<CellarItem> {
  const { data, error } = await supabase
    .from('cellar_items')
    .insert({ ...item, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as CellarItem;
}

export async function updateCellarItem(id: string, updates: Partial<CellarItem>): Promise<CellarItem> {
  const { data, error } = await supabase
    .from('cellar_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CellarItem;
}

export async function removeCellarItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('cellar_items')
    .update({ depleted: true })
    .eq('id', id);
  if (error) throw error;
}

// ─── Household Members ───────────────────────────────────────────────────────

export async function loadHouseholdMembers(userId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HouseholdMember[];
}

export async function saveHouseholdMember(member: Omit<HouseholdMember, 'id' | 'created_at'>): Promise<HouseholdMember> {
  const { data, error } = await supabase
    .from('household_members')
    .insert(member)
    .select()
    .single();
  if (error) throw error;
  return data as HouseholdMember;
}

export async function updateHouseholdMember(id: string, updates: Partial<Pick<HouseholdMember, 'name' | 'frequency_hint' | 'dietary_notes' | 'sort_order'>>): Promise<HouseholdMember> {
  const { data, error } = await supabase
    .from('household_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as HouseholdMember;
}

export async function deleteHouseholdMember(id: string): Promise<void> {
  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function bootstrapUserData(userId: string, email: string) {
  // Fire-and-forget — don't let profile upsert failure block data loading
  ensureUserProfile(userId, email).catch((e) =>
    console.warn('ensureUserProfile failed (non-fatal):', e)
  );

  const [inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin, userPreferences, recipes, barItems, cellarItems] =
    await Promise.all([
      loadInventoryItems(userId).catch((e) => { console.error('loadInventoryItems failed:', e); return [] as InventoryItem[]; }),
      loadGardenPlants(userId).catch((e) => { console.error('loadGardenPlants failed:', e); return [] as GardenPlant[]; }),
      loadCurrentMealPlan(userId).catch((e) => { console.error('loadCurrentMealPlan failed:', e); return null; }),
      loadShoppingList(userId).catch((e) => { console.error('loadShoppingList failed:', e); return null; }),
      loadTodayCheckin(userId).catch((e) => { console.error('loadTodayCheckin failed:', e); return null; }),
      loadUserPreferences(userId).catch((e) => { console.error('loadUserPreferences failed:', e); return null; }),
      loadRecipes(userId).catch((e) => { console.error('loadRecipes failed:', e); return [] as Recipe[]; }),
      loadBarItems(userId).catch((e) => { console.error('loadBarItems failed:', e); return [] as BarItem[]; }),
      loadCellarItems(userId).catch((e) => { console.error('loadCellarItems failed:', e); return [] as CellarItem[]; }),
    ]);

  return { inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin, userPreferences, recipes, barItems, cellarItems };
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export async function loadRecipes(userId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return data as Recipe[];
}

export async function saveRecipe(
  userId: string,
  data: Omit<Recipe, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'times_cooked'>
): Promise<Recipe> {
  const { data: existing } = await supabase
    .from('recipes')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', data.name)
    .maybeSingle();

  if (existing) {
    return updateRecipe(existing.id, data);
  }

  const { data: result, error } = await supabase
    .from('recipes')
    .insert({ ...data, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return result as Recipe;
}

export async function updateRecipe(
  id: string,
  updates: Partial<Omit<Recipe, 'id' | 'user_id' | 'created_at'>>
): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Recipe;
}

export async function saveRecipeBitePairing(id: string, bitePairing: string): Promise<void> {
  const { error } = await supabase.from('recipes').update({ bite_pairing: bitePairing }).eq('id', id);
  if (error) throw error;
}

export async function loadCookedMealForDate(
  userId: string,
  date: string
): Promise<{ actual_meal_name: string; rating: number | null; would_cook_again: boolean | null; notes: string | null; planned_meal_id: string | null } | null> {
  const { data } = await supabase
    .from('cooked_meals')
    .select('actual_meal_name, rating, would_cook_again, notes, planned_meal_id')
    .eq('user_id', userId)
    .eq('cooked_date', date)
    .eq('ate_out', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { actual_meal_name: string; rating: number | null; would_cook_again: boolean | null; notes: string | null; planned_meal_id: string | null } | null;
}

export async function loadTodaysSomethingElseCook(
  userId: string
): Promise<{ actual_meal_name: string; rating: number | null } | null> {
  const today = localDateString();
  const { data, error } = await supabase
    .from('cooked_meals')
    .select('actual_meal_name, rating')
    .eq('user_id', userId)
    .eq('cooked_date', today)
    .is('planned_meal_id', null)
    .eq('ate_out', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data as { actual_meal_name: string; rating: number | null };
}

export async function loadCookLogForRecipe(
  userId: string,
  recipeName: string
): Promise<Array<{ cooked_date: string; notes: string | null; rating: number | null; drink_name: string | null; drink_notes: string | null }>> {
  const { data, error } = await supabase
    .from('cooked_meals')
    .select('cooked_date, notes, rating, drink_name, drink_notes')
    .eq('user_id', userId)
    .ilike('actual_meal_name', recipeName)
    .order('cooked_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{ cooked_date: string; notes: string | null; rating: number | null; drink_name: string | null; drink_notes: string | null }>;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error, count } = await supabase
    .from('recipes')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw error;
  if (count === 0) throw new Error('Delete was blocked — check Supabase RLS policies for the recipes table.');
}
