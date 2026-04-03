import { create } from 'zustand';
import type {
  InventoryItem,
  MealPlan,
  PlannedMeal,
  ShoppingList,
  ShoppingListItem,
  GardenPlant,
  GardenSuggestion,
  CheckIn,
  UserPreferences,
  Recipe,
} from '../types';

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  userId: string | null;
  setUserId: (id: string | null) => void;

  // ── Current week ──────────────────────────────────────────────────────────
  currentMealPlan: MealPlan | null;
  plannedMeals: PlannedMeal[];
  setMealPlan: (plan: MealPlan, meals: PlannedMeal[]) => void;

  // ── Inventory ─────────────────────────────────────────────────────────────
  inventoryItems: InventoryItem[];
  setInventoryItems: (items: InventoryItem[]) => void;
  upsertInventoryItem: (item: InventoryItem) => void;
  removeInventoryItem: (id: string) => void;

  // ── Shopping ──────────────────────────────────────────────────────────────
  shoppingList: ShoppingList | null;
  shoppingItems: ShoppingListItem[];
  setShoppingList: (list: ShoppingList, items: ShoppingListItem[]) => void;
  toggleShoppingItem: (id: string) => void;
  addShoppingItem: (item: ShoppingListItem) => void;
  updateShoppingItemInStore: (id: string, updates: Partial<ShoppingListItem>) => void;

  // ── Garden ────────────────────────────────────────────────────────────────
  gardenPlants: GardenPlant[];
  setGardenPlants: (plants: GardenPlant[]) => void;
  updateGardenPlant: (id: string, updates: Partial<GardenPlant>) => void;
  addGardenPlantToStore: (plant: GardenPlant) => void;
  addGardenPlantsToStore: (plants: GardenPlant[]) => void;
  removeGardenPlant: (id: string) => void;
  gardenSuggestions: GardenSuggestion[];
  setGardenSuggestions: (suggestions: GardenSuggestion[]) => void;
  dismissSuggestion: (id: string) => void;

  // ── Today's check-in ──────────────────────────────────────────────────────
  todayCheckin: CheckIn | null;
  setTodayCheckin: (checkin: CheckIn | null) => void;

  // ── User preferences ──────────────────────────────────────────────────────
  userPreferences: UserPreferences | null;
  setUserPreferences: (prefs: UserPreferences | null) => void;

  // ── Recipes ───────────────────────────────────────────────────────────────
  recipes: Recipe[];
  setRecipes: (recipes: Recipe[]) => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipeInStore: (id: string, updates: Partial<Recipe>) => void;
  removeRecipe: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  userId: null,
  setUserId: (id) => set({ userId: id }),

  // Meal plan
  currentMealPlan: null,
  plannedMeals: [],
  setMealPlan: (plan, meals) => set({ currentMealPlan: plan, plannedMeals: meals }),

  // Inventory
  inventoryItems: [],
  setInventoryItems: (items) => set({ inventoryItems: items }),
  upsertInventoryItem: (item) =>
    set((state) => {
      const idx = state.inventoryItems.findIndex((i) => i.id === item.id);
      if (idx === -1) return { inventoryItems: [...state.inventoryItems, item] };
      const updated = [...state.inventoryItems];
      updated[idx] = item;
      return { inventoryItems: updated };
    }),
  removeInventoryItem: (id) =>
    set((state) => ({ inventoryItems: state.inventoryItems.filter((i) => i.id !== id) })),

  // Shopping
  shoppingList: null,
  shoppingItems: [],
  setShoppingList: (list, items) => set({ shoppingList: list, shoppingItems: items }),
  toggleShoppingItem: (id) =>
    set((state) => ({
      shoppingItems: state.shoppingItems.map((i) =>
        i.id === id ? { ...i, checked: !i.checked } : i
      ),
    })),
  addShoppingItem: (item) =>
    set((state) => ({ shoppingItems: [...state.shoppingItems, item] })),
  updateShoppingItemInStore: (id, updates) =>
    set((state) => ({
      shoppingItems: state.shoppingItems.map((i) => i.id === id ? { ...i, ...updates } : i),
    })),

  // Garden
  gardenPlants: [],
  setGardenPlants: (plants) => set({ gardenPlants: plants }),
  updateGardenPlant: (id, updates) =>
    set((state) => ({
      gardenPlants: state.gardenPlants.map((p) => p.id === id ? { ...p, ...updates } : p),
    })),
  addGardenPlantToStore: (plant) =>
    set((state) => ({ gardenPlants: [...state.gardenPlants, plant] })),
  addGardenPlantsToStore: (plants) =>
    set((state) => ({ gardenPlants: [...state.gardenPlants, ...plants] })),
  removeGardenPlant: (id) =>
    set((state) => ({ gardenPlants: state.gardenPlants.filter((p) => p.id !== id) })),
  gardenSuggestions: [],
  setGardenSuggestions: (suggestions) => set({ gardenSuggestions: suggestions }),
  dismissSuggestion: (id) =>
    set((state) => ({
      gardenSuggestions: state.gardenSuggestions.map((s) =>
        s.id === id ? { ...s, dismissed: true } : s
      ),
    })),

  // Check-in
  todayCheckin: null,
  setTodayCheckin: (checkin) => set({ todayCheckin: checkin }),

  // User preferences
  userPreferences: null,
  setUserPreferences: (prefs) => set({ userPreferences: prefs }),

  // Recipes
  recipes: [],
  setRecipes: (recipes) => set({ recipes }),
  addRecipe: (recipe) =>
    set((state) => ({ recipes: [...state.recipes, recipe].sort((a, b) => a.name.localeCompare(b.name)) })),
  updateRecipeInStore: (id, updates) =>
    set((state) => ({
      recipes: state.recipes.map((r) => r.id === id ? { ...r, ...updates } : r),
    })),
  removeRecipe: (id) =>
    set((state) => ({ recipes: state.recipes.filter((r) => r.id !== id) })),
}));
