// ─────────────────────────────────────────────────────────────────────────────
// EatWell — Supabase data service
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type {
  GardenPlant, GardenHarvest, GardenSuggestion,
  MealPlan, PlannedMeal, ShoppingList, ShoppingListItem,
  CookedMeal, CheckIn,
  InventoryItem, ItemCategory, ItemLocation,
  UserPreferences,
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
  updates: Partial<Pick<InventoryItem, 'quantity' | 'unit' | 'min_quantity' | 'notes' | 'depleted' | 'category' | 'location'>>
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
    name: i.name.toLowerCase().trim(),
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
    month_generated: number;
  }>
): Promise<GardenSuggestion[]> {
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

export async function loadCurrentMealPlan(
  userId: string
): Promise<{ plan: MealPlan; meals: PlannedMeal[] } | null> {
  // Use plain array + [0] instead of maybeSingle() to avoid edge-case errors.
  const { data: plans, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('week_start_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (planError) throw planError; // surface the actual error instead of silent null
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
  generated: GeneratedMealPlan
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

  await supabase.from('planned_meals').delete().eq('meal_plan_id', plan.id);

  const mealsToInsert = generated.meals.map((m) => ({
    meal_plan_id: plan.id,
    day_of_week: Math.max(0, Math.min(6, Math.round(Number(m.day_of_week)))),
    meal_name: m.meal_name,
    description: m.description,
    is_fish: m.is_fish,
    needs_recipe: m.needs_recipe,
    estimated_prep_minutes: m.estimated_prep_minutes,
    ingredients: m.ingredients,
    holly_included: m.holly_included,
  }));

  const { data: meals, error: mealsError } = await supabase
    .from('planned_meals')
    .insert(mealsToInsert)
    .select();
  if (mealsError) throw mealsError;

  return { plan: plan as MealPlan, meals: meals as PlannedMeal[] };
}

export async function reorderPlannedMeals(
  mealPlanId: string,
  originalIds: string[],
  meals: PlannedMeal[]
): Promise<PlannedMeal[]> {
  // INSERT new rows first — if this fails, the original rows are untouched.
  // No unique constraint on (meal_plan_id, day_of_week) so no conflict.
  const { data: newMeals, error: insError } = await supabase
    .from('planned_meals')
    .insert(meals.map((m) => ({
      meal_plan_id: mealPlanId,
      day_of_week: m.day_of_week,
      meal_name: m.meal_name,
      description: m.description,
      is_fish: m.is_fish,
      needs_recipe: m.needs_recipe,
      estimated_prep_minutes: m.estimated_prep_minutes,
      ingredients: m.ingredients,
      holly_included: m.holly_included,
    })))
    .select();
  if (insError) throw insError;

  // DELETE old rows only after INSERT succeeds.
  const { error: delError } = await supabase
    .from('planned_meals')
    .delete()
    .in('id', originalIds);
  if (delError) throw delError;

  return newMeals as PlannedMeal[];
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

function normalizeStore(raw: string): 'grocer' | 'butcher' | 'supermarket' {
  const s = (raw ?? '').toLowerCase();
  if (s === 'butcher' || s.includes('butch') || s.includes('meat')) return 'butcher';
  if (s === 'grocer' || s.includes('grocer') || s.includes('market') || s.includes('farm') || s.includes('fish')) return 'grocer';
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
    'oils_vinegars','condiments_sauces',
  ];
  // Legacy mapping
  if (s === 'fresh_herbs') return 'herbs_spices';
  if (s === 'meat_and_fish' || s === 'meat & fish') return 'meat_fish';
  if (valid.includes(s)) return s as ItemCategory;
  return 'pantry_dry_goods';
}

export async function saveShoppingList(
  userId: string,
  mealPlanId: string,
  weekStartDate: string,
  generated: GeneratedMealPlan
): Promise<{ list: ShoppingList; items: ShoppingListItem[] }> {
  // Delete any existing shopping lists for this meal plan (may be multiple from past bugs)
  const { data: existingLists } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('meal_plan_id', mealPlanId);

  if (existingLists?.length) {
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

  const itemMap = new Map<string, ShoppingListItem>();

  for (const meal of generated.meals) {
    for (const ing of meal.ingredients) {
      if (ing.from_garden && ing.ingredient_category !== 'herbs_spices') continue;
      // dairy_eggs are tracked via inventory, not shopping list
      if (ing.ingredient_category === 'dairy_eggs') continue;

      const key = `${ing.name}__${ing.ingredient_category}__${ing.from_fridge ? 'fridge' : ing.from_garden ? 'garden' : ing.is_pantry_staple ? 'pantry' : 'fresh'}`;
      if (itemMap.has(key)) {
        const existing = itemMap.get(key)!;
        existing.quantity += ing.quantity;
        (existing.meal_names as string[]).push(meal.meal_name);
      } else {
        itemMap.set(key, {
          id: '',
          shopping_list_id: list.id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          store: normalizeStore(ing.store),
          buy_timing: normalizeBuyTiming(ing.buy_timing),
          checked: ing.from_fridge ?? false,
          is_pantry_staple: ing.is_pantry_staple ?? false,
          from_fridge: ing.from_fridge ?? false,
          from_garden: ing.from_garden ?? false,
          ingredient_category: normalizeCategory(ing.ingredient_category ?? 'produce'),
          herb_backup: ing.herb_backup ?? null,
          meal_names: [meal.meal_name],
          created_at: '',
        });
      }
    }
  }

  const itemsToInsert = Array.from(itemMap.values()).map(({ id, created_at, ...rest }) => rest);

  const { data: items, error: itemsError } = await supabase
    .from('shopping_list_items')
    .insert(itemsToInsert)
    .select();
  if (itemsError) throw itemsError;

  return { list: list as ShoppingList, items: items as ShoppingListItem[] };
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

export async function addAdHocShoppingItem(
  shoppingListId: string,
  name: string,
  category: ItemCategory = 'pantry_dry_goods'
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert({
      shopping_list_id: shoppingListId,
      name: name.toLowerCase().trim(),
      quantity: 1,
      unit: 'item',
      store: category === 'meat_fish' ? 'butcher' : 'supermarket',
      buy_timing: 'weekend',
      checked: false,
      is_pantry_staple: false,
      from_fridge: false,
      from_garden: false,
      ingredient_category: category,
      herb_backup: null,
      meal_names: [],
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
      name: i.name.toLowerCase().trim(),
      quantity: 1,
      unit: 'item',
      store: i.category === 'meat_fish' ? 'butcher' : 'supermarket',
      buy_timing: 'weekend',
      checked: false,
      is_pantry_staple: false,
      from_fridge: false,
      from_garden: false,
      ingredient_category: i.category,
      herb_backup: null,
      meal_names: [],
    })))
    .select();
  if (error) throw error;
  return data as ShoppingListItem[];
}

// ─── Cooked Meals & Check-ins ─────────────────────────────────────────────────

export async function logCookedMeal(
  meal: Omit<CookedMeal, 'id' | 'created_at'>
): Promise<CookedMeal> {
  const { data, error } = await supabase
    .from('cooked_meals')
    .insert(meal)
    .select()
    .single();
  if (error) throw error;
  return data as CookedMeal;
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
  const today = new Date().toISOString().split('T')[0];
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

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function bootstrapUserData(userId: string, email: string) {
  // Fire-and-forget — don't let profile upsert failure block data loading
  ensureUserProfile(userId, email).catch((e) =>
    console.warn('ensureUserProfile failed (non-fatal):', e)
  );

  const [inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin, userPreferences] =
    await Promise.all([
      loadInventoryItems(userId).catch((e) => { console.error('loadInventoryItems failed:', e); return [] as InventoryItem[]; }),
      loadGardenPlants(userId).catch((e) => { console.error('loadGardenPlants failed:', e); return [] as GardenPlant[]; }),
      loadCurrentMealPlan(userId).catch((e) => { console.error('loadCurrentMealPlan failed:', e); return null; }),
      loadShoppingList(userId).catch((e) => { console.error('loadShoppingList failed:', e); return null; }),
      loadTodayCheckin(userId).catch((e) => { console.error('loadTodayCheckin failed:', e); return null; }),
      loadUserPreferences(userId).catch((e) => { console.error('loadUserPreferences failed:', e); return null; }),
    ]);

  return { inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin, userPreferences };
}
