// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  timezone: string; // 'Pacific/Auckland'
  notification_time: string; // '07:00'
  created_at: string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────
// Unified table replaces fridge_items + pantry_items.
// Location separates WHERE something is stored from WHAT it is.

export type ItemCategory =
  | 'meat_fish'
  | 'dairy_eggs'
  | 'produce'
  | 'bread_bakery'
  | 'pantry_dry_goods'
  | 'herbs_spices'
  | 'cans_preserves'
  | 'oils_vinegars'
  | 'condiments_sauces'
  | 'beverages'
  | 'alcohol'
  | 'household';

export type ItemLocation = 'fridge' | 'freezer' | 'pantry' | 'garden' | 'bar' | 'cellar';

export interface InventoryItem {
  id: string;
  user_id: string;
  name: string;
  category: ItemCategory;
  location: ItemLocation;
  quantity: number;
  unit: string;
  min_quantity: number; // low-stock threshold — 0 = no alert
  notes: string | null;
  added_date: string; // ISO date
  depleted: boolean;
  is_staple: boolean;
  created_at: string;
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export type SpiceLevel = 'mild' | 'medium' | 'bold';
export type WeekendCooking = 'quick' | 'project';

export interface UserPreferences {
  id: string;
  user_id: string;
  cuisine_likes: string[];
  cuisine_dislikes: string[];
  proteins_excluded: string[];
  spice_level: SpiceLevel;
  weeknight_max_minutes: number;
  weekend_cooking: WeekendCooking;
  holly_joins_regularly: boolean;
  cooking_notes: string | null;
  standing_orders: string | null;
  rotation_repeat_ratio: number;
  rotation_min_rated: number;
  garden_location: string;
  wine_detail_level?: 'simple' | 'detailed';
  wine_guide_site?: string;
  recipe_search_site?: string;
  created_at: string;
  updated_at: string;
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
  variety: string | null;
  location_note: string | null;
  is_cut_and_come_again: boolean;
  updated_at: string;
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

export interface GardenSuggestion {
  id: string;
  user_id: string;
  plant_name: string;
  why_now: string;
  why_worth_growing: string;
  why_suits_cooking: string;
  soil_notes: string | null;
  sun_notes: string | null;
  month_generated: number;
  dismissed: boolean;
  added_to_garden: boolean;
  created_at: string;
}

export interface ReplantAdvice {
  timing: string;
  is_good_time: boolean;
  tips_from_history: string;
  soil_notes: string | null;
  sun_notes: string | null;
  companion_note: string | null;
}

// ─── Meal Planning ────────────────────────────────────────────────────────────

export type Store = 'grocer' | 'butcher' | 'supermarket' | 'liquor_store';
export type BuyTiming = 'weekend' | 'day_of';

// Unified category set — matches ItemCategory and inventory_items.category.
// dairy_eggs intentionally excluded from shopping list generation (handled via inventory).
export type IngredientCategory = ItemCategory;

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string; // ISO date — always a Monday
  generated_at: string;
  confirmed: boolean;
  notes: string | null;
  created_at: string;
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
  from_fridge: boolean;
  from_garden: boolean;
  is_pantry_staple: boolean;
  ingredient_category: IngredientCategory;
  herb_backup: string | null;
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
  from_fridge: boolean;
  from_garden: boolean;
  ingredient_category: IngredientCategory;
  herb_backup: string | null;
  meal_names: string[];
  is_adhoc: boolean;
  conditional_note: string | null;
  conditional_meal_ids: string[] | null;
  created_at: string;
}

// ─── Cooked Meals Log ────────────────────────────────────────────────────────

export interface CookedMeal {
  id: string;
  user_id: string;
  cooked_date: string; // ISO date
  planned_meal_id: string | null;
  actual_meal_name: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  would_cook_again: boolean | null;
  notes: string | null;
  drink_name: string | null;
  drink_notes: string | null;
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
  rating?: number | null;
  would_cook_again?: boolean | null;
  notes?: string | null;
}

// ─── Bar & Cellar ─────────────────────────────────────────────────────────────

export type SpiritType =
  | 'whiskey' | 'cognac_brandy' | 'gin' | 'vodka' | 'rum'
  | 'tequila_mezcal' | 'vermouth_fortified' | 'liqueur_aperitif'
  | 'bitters' | 'syrup_mixer' | 'other';

export interface BarItem {
  id: string;
  user_id: string;
  name: string;
  spirit_type: SpiritType;
  abv: number | null;
  size_ml: number | null;
  country: string | null;
  quantity: number;
  notes: string | null;
  depleted: boolean;
  created_at: string;
}

export interface CellarItem {
  id: string;
  user_id: string;
  name: string;
  producer: string | null;
  varietal: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  size_ml: number;
  quantity: number;
  notes: string | null;
  depleted: boolean;
  created_at: string;
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export type RecipeCategory =
  | 'mains' | 'sauces_dressings' | 'sides'
  | 'desserts' | 'baking' | 'marinades_rubs'
  | 'glossary' | 'cocktails';

export interface RecipeGuideJson {
  steps: string[];
  components: Array<{ name: string; description: string; steps: string[] }>;
  glossary: Array<{ term: string; definition: string }>;
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  category: RecipeCategory;
  description: string | null;
  ingredients: string | null;
  method: string | null;
  source_url: string | null;
  source_book: string | null;
  page_number: number | null;
  rating: number | null;
  would_cook_again: boolean | null;
  times_cooked: number;
  cooked_meal_id: string | null;
  guide_json: RecipeGuideJson | null;
  bite_pairing: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Canterbury Garden Calendar ───────────────────────────────────────────────

export interface PlantWindow {
  plant: string;
  category: 'herb' | 'salad' | 'vegetable' | 'fruit';
  plantMonths: number[]; // 1–12, Canterbury NZ (Southern Hemisphere)
  harvestWeeksAfterPlanting: [number, number]; // [min, max]
  harvestType: 'daily' | 'once' | 'windfall';
  storagePrompt: string | null;
}
