// ─────────────────────────────────────────────────────────────────────────────
// EatWell — Supabase data service
// All database reads and writes go through here.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type {
  FridgeItem, GardenPlant, GardenHarvest,
  MealPlan, PlannedMeal, ShoppingList, ShoppingListItem,
  CookedMeal, CheckIn,
} from '../types';
import type { GeneratedMealPlan } from './claude';

// ─── Fridge ───────────────────────────────────────────────────────────────────

export async function loadFridgeItems(userId: string): Promise<FridgeItem[]> {
  const { data, error } = await supabase
    .from('fridge_items')
    .select('*')
    .eq('user_id', userId)
    .order('expected_expiry_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as FridgeItem[];
}

export async function addFridgeItem(
  item: Omit<FridgeItem, 'id' | 'created_at'>
): Promise<FridgeItem> {
  const { data, error } = await supabase
    .from('fridge_items')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data as FridgeItem;
}

export async function removeFridgeItem(id: string): Promise<void> {
  const { error } = await supabase.from('fridge_items').delete().eq('id', id);
  if (error) throw error;
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
  plant: Omit<GardenPlant, 'id' | 'created_at'>
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
): Promise<void> {
  const { error } = await supabase
    .from('garden_plants')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
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

// ─── Meal Plans ───────────────────────────────────────────────────────────────

export async function loadCurrentMealPlan(
  userId: string
): Promise<{ plan: MealPlan; meals: PlannedMeal[] } | null> {
  // Get the most recent confirmed plan
  const { data: plan, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('confirmed', true)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .single();

  if (planError || !plan) return null;

  const { data: meals, error: mealsError } = await supabase
    .from('planned_meals')
    .select('*')
    .eq('meal_plan_id', plan.id)
    .order('day_of_week');

  if (mealsError) throw mealsError;

  return { plan: plan as MealPlan, meals: meals as PlannedMeal[] };
}

// Saves a Claude-generated meal plan to Supabase and returns the saved records
export async function saveMealPlan(
  userId: string,
  weekStartDate: string,
  generated: GeneratedMealPlan
): Promise<{ plan: MealPlan; meals: PlannedMeal[] }> {
  // Upsert the meal plan row
  const { data: plan, error: planError } = await supabase
    .from('meal_plans')
    .upsert(
      { user_id: userId, week_start_date: weekStartDate, confirmed: true },
      { onConflict: 'user_id,week_start_date' }
    )
    .select()
    .single();
  if (planError) throw planError;

  // Delete any existing planned meals for this plan (in case of replan)
  await supabase.from('planned_meals').delete().eq('meal_plan_id', plan.id);

  // Insert the new meals
  const mealsToInsert = generated.meals.map((m) => ({
    meal_plan_id: plan.id,
    day_of_week: m.day_of_week,
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

export async function saveShoppingList(
  userId: string,
  mealPlanId: string,
  weekStartDate: string,
  generated: GeneratedMealPlan
): Promise<{ list: ShoppingList; items: ShoppingListItem[] }> {
  // Create the shopping list
  const { data: list, error: listError } = await supabase
    .from('shopping_lists')
    .insert({ user_id: userId, meal_plan_id: mealPlanId, week_start_date: weekStartDate })
    .select()
    .single();
  if (listError) throw listError;

  // Aggregate ingredients across all meals, excluding from_fridge and from_garden items
  const itemMap = new Map<string, ShoppingListItem>();

  for (const meal of generated.meals) {
    for (const ing of meal.ingredients) {
      if (ing.from_fridge || ing.from_garden) continue;

      const key = `${ing.name}__${ing.store}__${ing.buy_timing}`;
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
          store: ing.store,
          buy_timing: ing.buy_timing,
          checked: false,
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

// ─── Bootstrap — load all app data for the current user ──────────────────────

export async function bootstrapUserData(userId: string) {
  const [fridgeItems, gardenPlants, mealPlanData, shoppingData, todayCheckin] =
    await Promise.all([
      loadFridgeItems(userId),
      loadGardenPlants(userId),
      loadCurrentMealPlan(userId),
      loadShoppingList(userId),
      loadTodayCheckin(userId),
    ]);

  return { fridgeItems, gardenPlants, mealPlanData, shoppingData, todayCheckin };
}
