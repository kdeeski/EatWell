// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  timezone: string; // 'Pacific/Auckland'
  notification_time: string; // '07:00'
  created_at: string;
}

// ─── Fridge / Inventory ───────────────────────────────────────────────────────

export type InventorySource = 'shopping' | 'garden' | 'manual' | 'market';

export interface FridgeItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string; // 'g', 'bunch', 'piece', 'kg', etc.
  source: InventorySource;
  purchased_date: string; // ISO date
  expected_expiry_date: string | null; // ISO date
  notes: string | null;
  created_at: string;
}

// ─── Garden ───────────────────────────────────────────────────────────────────

export type PlantStatus = 'planted' | 'growing' | 'ready' | 'harvested' | 'finished';
export type HarvestStorage = 'fresh' | 'frozen' | 'preserved';

export interface GardenPlant {
  id: string;
  user_id: string;
  plant_name: string;
  planted_date: string; // ISO date
  expected_ready_date: string | null; // ISO date
  status: PlantStatus;
  quantity_planted: number | null;
  notes: string | null;
  created_at: string;
}

export interface GardenHarvest {
  id: string;
  garden_plant_id: string;
  user_id: string;
  harvest_date: string; // ISO date
  quantity: number | null;
  unit: string | null;
  storage: HarvestStorage;
  notes: string | null;
  created_at: string;
}

// ─── Meal Planning ────────────────────────────────────────────────────────────

export type Store = 'grocer' | 'butcher' | 'supermarket';
export type BuyTiming = 'weekend' | 'day_of';

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string; // ISO date — always a Monday
  generated_at: string;
  confirmed: boolean;
  notes: string | null;
}

export interface PlannedMeal {
  id: string;
  meal_plan_id: string;
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
  meal_name: string;
  description: string | null;
  is_fish: boolean;
  needs_recipe: boolean;
  estimated_prep_minutes: number | null;
  ingredients: PlannedIngredient[];
  holly_included: boolean;
  created_at: string;
}

export interface PlannedIngredient {
  name: string;
  quantity: number;
  unit: string;
  store: Store;
  buy_timing: BuyTiming;
  from_fridge: boolean; // already in inventory — don't add to shopping list
  from_garden: boolean;
  is_pantry_staple: boolean;
}

// ─── Shopping List ────────────────────────────────────────────────────────────

export interface ShoppingList {
  id: string;
  meal_plan_id: string;
  user_id: string;
  week_start_date: string;
  created_at: string;
}

export interface ShoppingListItem {
  id: string;
  shopping_list_id: string;
  name: string;
  quantity: number;
  unit: string;
  store: Store;
  buy_timing: BuyTiming;
  checked: boolean;
  is_pantry_staple: boolean;
  meal_names: string[]; // which meals this is needed for
  created_at: string;
}

// ─── Cooked Meals Log ────────────────────────────────────────────────────────

export interface CookedMeal {
  id: string;
  user_id: string;
  cooked_date: string; // ISO date
  planned_meal_id: string | null; // null if something off-plan was cooked
  actual_meal_name: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  voice_note_url: string | null;
  ate_out: boolean;
  created_at: string;
}

// ─── Morning Check-in ────────────────────────────────────────────────────────

export interface CheckIn {
  id: string;
  user_id: string;
  checkin_date: string; // ISO date
  last_night_response: LastNightResponse | null;
  tonight_planned_meal_id: string | null;
  holly_joining: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface LastNightResponse {
  type: 'planned' | 'something_else' | 'ate_out' | 'didnt_cook';
  meal_name?: string;
  cooked_meal_id?: string;
}

// ─── Canterbury Garden Calendar ───────────────────────────────────────────────

export interface PlantWindow {
  plant: string;
  category: 'herb' | 'salad' | 'vegetable' | 'fruit';
  plantMonths: number[]; // 1–12, Canterbury NZ (Southern Hemisphere)
  harvestWeeksAfterPlanting: [number, number]; // [min, max]
  harvestType: 'daily' | 'once' | 'windfall';
  storagePrompt: string | null; // null if harvest-on-day type
}
